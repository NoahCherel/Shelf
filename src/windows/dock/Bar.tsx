import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { byId } from "../../core/registry";
import { useLayout } from "../../core/layout";
import { useSettings, type SettingsData } from "../../core/settings";
import { usePicker, useShell } from "../../core/shell";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import type { WidgetDef } from "../../core/widget";
import { GlassLayer } from "../../design/glass/GlassLayer";
import { openPanel } from "../../panels";
import "./dock.css";

const DEFAULT_CARD_WIDTH = 340;
const DEFAULT_CARD_HEIGHT = 300;
const MENU_WIDTH = 210;
const MENU_HEIGHT = 190;
/** A press that moves less than this is a click. */
const DRAG_DISTANCE = 6;

type Edge = SettingsData["edge"];

/** Tells Rust how big the bar is and how it should sit on the screen. */
export function reportSize(el: HTMLElement, gap: number, float: boolean, edge: Edge): void {
  const { width, height } = el.getBoundingClientRect();
  invoke("set_dock_width", { width, bar: Math.ceil(height), gap, float, edge }).catch(() => {});
}

export function edgeAt(screenY: number, screenHeight: number): Edge {
  return screenY < screenHeight / 2 ? "top" : "bottom";
}

/** Dragging by an empty spot moves the dock, and letting go settles it on the nearer edge. */
function useEdgeDrag() {
  const start = useRef<number | null>(null);
  const moved = useRef(false);
  return {
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      const { lockDock } = useSettings.getState();
      if (e.button !== 0 || e.target !== e.currentTarget || (lockDock && !usePicker.getState().open)) return;
      start.current = e.screenY;
      moved.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      if (start.current === null) return;
      const offset = e.screenY - start.current;
      if (!moved.current && Math.abs(offset) < DRAG_DISTANCE) return;
      moved.current = true;
      invoke("dock_drag", { offset }).catch(() => {});
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>) {
      if (start.current === null) return;
      start.current = null;
      if (!moved.current) return;
      useSettings.getState().update({ edge: edgeAt(e.screenY, window.screen.height) });
      invoke("dock_drag_end").catch(() => {});
    },
  };
}

export function handleDragEnd({ active, over }: { active: { id: unknown }; over: { id: unknown } | null }): void {
  if (!over || active.id === over.id) return;
  const { ids, move } = useLayout.getState();
  move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
}

function Slot({ def }: { def: WidgetDef }) {
  const T = def.Tile;
  const { data, status, error, refresh } = useProvider(def.provider, def.sample);
  const pickerOpen = usePicker((s) => s.open);
  const lockDock = useSettings((s) => s.lockDock);
  const remove = useLayout((s) => s.remove);
  const locked = lockDock && !pickerOpen;
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: def.id, disabled: locked });

  const openCard = (e: MouseEvent<HTMLDivElement>) => {
    if (pickerOpen) return;
    if (def.panel) return openPanel(def.panel, e.currentTarget);
    if (!def.Card) return;
    const r = e.currentTarget.getBoundingClientRect();
    invoke("open_card", {
      widgetId: def.id,
      tileX: r.left,
      tileWidth: r.width,
      width: def.cardWidth ?? DEFAULT_CARD_WIDTH,
      height: def.cardHeight ?? DEFAULT_CARD_HEIGHT,
    }).catch(() => {});
  };

  return (
    <div
      ref={setNodeRef}
      className={def.id === "apps" ? "slot slot--shrink" : "slot"}
      data-widget-id={def.id}
      data-status={status}
      data-locked={locked}
      data-dragging={isDragging}
      style={{ transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined, transition }}
      onClick={openCard}
      {...listeners}
    >
      <T data={data} status={status} error={error} refresh={refresh} />
      {pickerOpen && (
        <button
          type="button"
          className="slot__remove"
          aria-label={`Remove ${def.name}`}
          onClick={(e) => {
            e.stopPropagation();
            remove(def.id);
          }}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 5h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

function openMenu(e: MouseEvent<HTMLDivElement>) {
  e.preventDefault();
  const slot = (e.target as HTMLElement).closest<HTMLElement>("[data-widget-id]");
  invoke("open_card", {
    widgetId: `__menu:${slot?.dataset.widgetId ?? ""}`,
    tileX: e.clientX,
    tileWidth: 0,
    width: MENU_WIDTH,
    height: MENU_HEIGHT,
  }).catch(() => {});
}

export function DockBar() {
  const ids = useLayout((s) => s.ids);
  const fullscreen = useShell((s) => s.fullscreen);
  const locked = useShell((s) => s.locked);
  const style = useSettings((s) => s.style);
  const [glassFailed, setGlassFailed] = useState(false);
  const onGlassUnavailable = useCallback(() => setGlassFailed(true), []);
  const glass = style === "liquid" && !fullscreen && !locked && !glassFailed;
  const full = useSettings((s) => s.dockWidth) === "full";
  // Like the taskbar, a full-width dock sits right on the edge.
  const edgeGap = useSettings((s) => (s.dockWidth === "full" ? 0 : s.edgeGap));
  const edge = useSettings((s) => s.edge);
  const edgeDrag = useEdgeDrag();
  const floatOverWindows = useSettings((s) => s.floatOverWindows);
  const bar = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE } }));

  // Keeps the window exactly as wide as the bar. The bar sizes itself to its content,
  // independent of the window, so this can't feed back into itself.
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const observer = new ResizeObserver(() => reportSize(el, edgeGap, floatOverWindows, edge));
    observer.observe(el);
    return () => observer.disconnect();
  }, [edgeGap, floatOverWindows, edge]);

  return (
    // Limited by the screen, not the window, which is always only as wide as the bar.
    <div
      className="dock"
      data-testid="bar"
      data-glass={glass}
      data-width={full ? "full" : "pill"}
      ref={bar}
      style={{ maxWidth: window.screen.width, width: full ? window.screen.width : undefined }}
      onContextMenu={openMenu}
      {...edgeDrag}
    >
      <GlassLayer active={glass} onUnavailable={onGlassUnavailable} />
      {!fullscreen && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            {ids.map((id) => {
              const def = byId(id);
              return def ? <Slot key={id} def={def} /> : null;
            })}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
