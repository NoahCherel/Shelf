import { useComeAndGo } from "../../core/useComeAndGo";
import { CARD } from "../../core/names";
import React, { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragMoveEvent, type DragStartEvent } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { byId } from "../../core/byId";
import { canPutInFolder, isFolderId } from "../../core/folderId";
import { isPinId } from "../../core/pinId";
import { useLayout } from "../../core/layout";
import { useSettings, type SettingsData } from "../../core/settings";
import { usePicker, useShell } from "../../core/shell";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import type { WidgetDef } from "../../core/widget";
import { GlassLayer } from "../../design/glass/GlassLayer";
import { usesGlass } from "../../design/theme";
import { openPanel } from "../../panels/open";
import { DRAG_DISTANCE } from "../../core/gestures";
import { useEdgeDrag } from "./useEdgeDrag";
import { type Free, useFreePlacement } from "./useFreePlacement";
import "./dock.css";

const DEFAULT_CARD_WIDTH = 340;
const DEFAULT_CARD_HEIGHT = 300;
const MENU_WIDTH = 210;
const MENU_HEIGHT = 190;
/** How long the pointer rests on a tile before its name shows. */
const TIP_DELAY_MS = 600;
/** Widgets that name each of their own parts. */
const OWN_NAMES = new Set(["apps", "system-status"]);

type Edge = SettingsData["edge"];

/** Tells Rust how big the bar is and how it should sit on the screen. */
export function reportSize(el: HTMLElement, gap: number, float: boolean, edge: Edge, along: number): void {
  const { width, height } = el.getBoundingClientRect();
  invoke("set_dock_width", { width, bar: Math.ceil(height), gap, float, edge, along }).catch(() => {});
}

/** How long a widget is held over another widget before dropping creates a folder. */
const WIDGET_HOLD_MS = 350;
/** Dropping onto an existing folder arms almost immediately. */
const FOLDER_HOLD_MS = 150;
/** While a widget is held over another to form/join a folder, neighbours stop sliding away. */
const stayPut = () => null;

export function handleDragEnd(
  { active, over }: { active: { id: unknown }; over: { id: unknown } | null },
  groupTarget?: string | null,
): void {
  const activeId = String(active.id);
  const { ids, move, groupWidgets } = useLayout.getState();
  if (groupTarget && groupTarget !== activeId && canPutInFolder(activeId) && groupTarget !== "apps") {
    groupWidgets(activeId, groupTarget);
    return;
  }
  if (!over || active.id === over.id) return;
  const overId = String(over.id);
  move(ids.indexOf(activeId), ids.indexOf(overId));
}

/** What a click on a widget's tile opens: its shared panel, or its own card over the tile. */
export function openWidgetCard(def: WidgetDef, tile: HTMLElement): void {
  if (def.panel) return openPanel(def.panel, tile);
  if (!def.Card) return;
  const r = tile.getBoundingClientRect();
  invoke("open_card", {
    widgetId: def.id,
    tileX: r.left,
    tileWidth: r.width,
    width: def.cardWidth ?? DEFAULT_CARD_WIDTH,
    height: def.cardHeight ?? DEFAULT_CARD_HEIGHT,
  }).catch(() => {});
}

/** The words in a tile's bubble. A pinned app's widget is named after what its tile shows, as its id only knows the file. */
function tipText(def: WidgetDef, tile: HTMLElement): string {
  if (!isPinId(def.id)) return def.name;
  return tile.querySelector("[aria-label]")?.getAttribute("aria-label") ?? def.name;
}

/** The widget's name in a bubble above it, once the pointer rests there, as for apps. */
function useTileTip(def: WidgetDef, off: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shown = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cancel = () => {
    clearTimeout(timer.current);
    if (shown.current) invoke("preview_leave").catch(() => {});
    shown.current = false;
  };
  const enter = (e: MouseEvent<HTMLDivElement>) => {
    if (off || OWN_NAMES.has(def.id) || !useSettings.getState().hoverNames) return;
    const tile = e.currentTarget;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = tile.getBoundingClientRect();
      shown.current = true;
      invoke("preview_tip", { text: tipText(def, tile), tileX: r.left, tileWidth: r.width }).catch(() => {});
    }, TIP_DELAY_MS);
  };
  return { enter, cancel };
}

/** Whether a tile shows inside a narrowed, scrolling dock. Everything counts as shown without one. */
function useInView(el: HTMLElement | null): boolean {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const root = el?.closest(".dock__scroll");
    if (!el || !root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setShown(entry.isIntersecting), { root });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return shown;
}

function Slot({
  def,
  free,
  arriving,
  leavingWidth,
  folderTarget,
}: {
  def: WidgetDef;
  free?: Free;
  arriving?: boolean;
  leavingWidth?: number;
  folderTarget?: boolean;
}) {
  const T = def.Tile;
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const { data, status, error, refresh } = useProvider(def.provider, def.sample, useInView(node));
  const pickerOpen = usePicker((s) => s.open);
  const lockDock = useSettings((s) => s.lockDock);
  const remove = useLayout((s) => s.remove);
  const locked = lockDock && !pickerOpen;
  const leaving = leavingWidth !== undefined;
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: def.id, disabled: locked || !!free || leaving });
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      setNode(el);
    },
    [setNodeRef],
  );

  const tip = useTileTip(def, pickerOpen || leaving || isDragging);

  const openCard = (e: MouseEvent<HTMLDivElement>) => {
    if (pickerOpen) return;
    openWidgetCard(def, e.currentTarget);
  };

  return (
    <div
      ref={ref}
      className={`slot${def.id === "apps" ? " slot--shrink" : ""}${arriving ? " slot--new" : ""}${leaving ? " slot--leaving" : ""}`}
      aria-hidden={leaving || undefined}
      data-widget-id={def.id}
      data-status={status}
      data-locked={locked}
      data-dragging={isDragging}
      data-moving={free?.moving}
      data-folder-target={folderTarget || undefined}
      style={{
        ...(free ? { left: free.left } : { transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined, transition }),
        ...(leaving ? ({ "--w": `${leavingWidth}px` } as React.CSSProperties) : {}),
      }}
      onClick={leaving ? undefined : openCard}
      onPointerEnter={tip.enter}
      onPointerLeave={tip.cancel}
      onPointerDownCapture={tip.cancel}
      {...(leaving ? {} : free ? { onPointerDown: free.grab } : listeners)}
    >
      <T data={data} status={status} error={error} refresh={refresh} />
      {pickerOpen && <RemoveBadge label={`Remove ${def.name}`} onRemove={() => remove(def.id)} />}
    </div>
  );
}

function RemoveBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      className="slot__remove"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
    >
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2 5h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** Pulling either end narrows the dock from both sides, as it stays centred. A double-click undoes it. */
function End({ side, bar }: { side: "left" | "right"; bar: React.RefObject<HTMLDivElement | null> }) {
  const from = useRef<{ x: number; width: number } | null>(null);
  const widthFor = (screenX: number) => {
    const start = from.current!;
    const dx = (screenX - start.x) * (side === "right" ? 1 : -1);
    return Math.max(useSettings.getState().size, Math.round(start.width + dx * 2));
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={side === "left" ? "Left end" : "Right end"}
      className={`dock__end dock__end--${side}`}
      onPointerDown={(e) => {
        if (e.button !== 0 || !bar.current) return;
        e.stopPropagation();
        from.current = { x: e.screenX, width: useSettings.getState().narrowWidth ?? bar.current.getBoundingClientRect().width };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (from.current && bar.current) bar.current.style.maxWidth = `${Math.min(window.screen.width, widthFor(e.screenX))}px`;
      }}
      onPointerUp={(e) => {
        if (!from.current) return;
        const width = widthFor(e.screenX);
        from.current = null;
        // Pulled back out past everything: its natural width again.
        const scroller = bar.current?.querySelector<HTMLElement>(".dock__scroll");
        const natural = scroller && scroller.scrollWidth > 0 ? scroller.scrollWidth + (bar.current!.offsetWidth - scroller.clientWidth) : Infinity;
        useSettings.getState().update({ narrowWidth: width >= natural ? null : width });
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        useSettings.getState().update({ narrowWidth: null });
      }}
    />
  );
}

/** The wheel and a touchpad's sideways swipe glide along a narrowed dock. */
function glide(e: React.WheelEvent<HTMLDivElement>) {
  if ((e.target as HTMLElement).closest("[data-own-wheel]")) return;
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  e.currentTarget.scrollBy({ left: delta, behavior: "smooth" });
}

function openMenu(e: MouseEvent<HTMLDivElement>) {
  e.preventDefault();
  const slot = (e.target as HTMLElement).closest<HTMLElement>("[data-widget-id]");
  invoke("open_card", {
    widgetId: `${CARD.menu}${slot?.dataset.widgetId ?? ""}`,
    tileX: e.clientX,
    tileWidth: 0,
    width: MENU_WIDTH,
    height: MENU_HEIGHT,
  }).catch(() => {});
}

export function DockBar() {
  const ids = useLayout((s) => s.ids);
  useLayout((s) => s.folders);
  const fullscreen = useShell((s) => s.fullscreen);
  const locked = useShell((s) => s.locked);
  const style = useSettings((s) => s.style);
  const [glassFailed, setGlassFailed] = useState(false);
  const onGlassUnavailable = useCallback(() => setGlassFailed(true), []);
  const clearMaterial = useSettings((s) => s.clearMaterial);
  const visibleInCaptures = useSettings((s) => s.visibleInCaptures);
  const glass = usesGlass(style, clearMaterial, visibleInCaptures) && !fullscreen && !locked && !glassFailed;
  const full = useSettings((s) => s.dockWidth) === "full";
  // Like the taskbar, a full-width dock sits right on the edge.
  const edgeGap = useSettings((s) => (s.dockWidth === "full" ? 0 : s.edgeGap));
  const edge = useSettings((s) => s.edge);
  const pillAt = useSettings((s) => s.pillAt);
  const edgeDrag = useEdgeDrag();
  const autoHide = useSettings((s) => s.autoHide);
  const showOnDesktop = useSettings((s) => s.showOnDesktop);
  const narrowWidth = useSettings((s) => s.narrowWidth);
  const narrow = !full && narrowWidth !== null;
  const pickerOpen = usePicker((s) => s.open);
  const lockDock = useSettings((s) => s.lockDock);
  const canResize = !full && !(lockDock && !pickerOpen);

  useEffect(() => {
    invoke("set_dock_behaviour", { autoHide, showOnDesktop }).catch(() => {});
  }, [autoHide, showOnDesktop]);
  const floatOverWindows = useSettings((s) => s.floatOverWindows);
  const bar = useRef<HTMLDivElement>(null);
  const placed = useFreePlacement(full, ids, lockDock && !pickerOpen);
  const coming = useComeAndGo(ids.length ? ids : null, (id) => id, (id) => placed.row.current?.querySelector(`[data-widget-id="${id}"]`)?.getBoundingClientRect().width ?? 0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE } }));
  const [folderTarget, setFolderTarget] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holdOverId = useRef<string | null>(null);
  const armedTarget = useRef<string | null>(null);
  const restingRects = useRef<Map<string, { left: number; width: number }>>(new Map());
  const dragStartX = useRef<number | null>(null);

  const clearHold = useCallback(() => {
    clearTimeout(holdTimer.current);
    holdOverId.current = null;
    armedTarget.current = null;
    setFolderTarget(null);
  }, []);
  useEffect(() => () => clearTimeout(holdTimer.current), []);

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      clearHold();
      const map = new Map<string, { left: number; width: number }>();
      placed.row.current?.querySelectorAll<HTMLElement>(":scope > [data-widget-id]").forEach((el) => {
        const wid = el.dataset.widgetId;
        if (!wid) return;
        const r = el.getBoundingClientRect();
        map.set(wid, { left: r.left, width: r.width });
      });
      restingRects.current = map;
      const ev = e.activatorEvent as PointerEvent | MouseEvent | undefined;
      dragStartX.current = ev && "clientX" in ev ? ev.clientX : null;
    },
    [clearHold, placed.row],
  );

  const onDragMove = useCallback(
    (e: DragMoveEvent) => {
      const activeId = String(e.active.id);
      if (!canPutInFolder(activeId)) return clearHold();
      const translated = e.active.rect.current.translated;
      const pointerX =
        dragStartX.current !== null
          ? dragStartX.current + e.delta.x
          : translated
            ? translated.left + translated.width / 2
            : null;
      if (pointerX === null) return clearHold();

      let hit: string | null = null;
      for (const [wid, rect] of restingRects.current) {
        if (wid === activeId || wid === "apps") continue;
        // Entire tile counts for an existing folder; middle 70% counts for creating a new folder.
        const pad = isFolderId(wid) ? 0 : rect.width * 0.15;
        if (pointerX >= rect.left + pad && pointerX <= rect.left + rect.width - pad) {
          hit = wid;
          break;
        }
      }
      if (!hit) {
        if (holdOverId.current || armedTarget.current) clearHold();
        return;
      }
      if (holdOverId.current === hit) return;
      clearHold();
      holdOverId.current = hit;
      const delay = isFolderId(hit) ? FOLDER_HOLD_MS : WIDGET_HOLD_MS;
      holdTimer.current = setTimeout(() => {
        armedTarget.current = hit;
        setFolderTarget(hit);
      }, delay);
    },
    [clearHold],
  );

  const onDragEnd = useCallback(
    (event: { active: { id: unknown }; over: { id: unknown } | null }) => {
      const target = armedTarget.current;
      clearHold();
      restingRects.current.clear();
      dragStartX.current = null;
      handleDragEnd(event, target);
    },
    [clearHold],
  );

  // Keeps the window exactly as wide as the bar. The bar sizes itself to its content,
  // independent of the window, so this can't feed back into itself.
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const observer = new ResizeObserver(() => reportSize(el, edgeGap, floatOverWindows, edge, pillAt));
    observer.observe(el);
    return () => observer.disconnect();
  }, [edgeGap, floatOverWindows, edge, pillAt]);

  return (
    // Limited by the screen, not the window, which is always only as wide as the bar.
    <div
      className="dock"
      data-testid="bar"
      data-glass={glass}
      data-width={full ? "full" : "pill"}
      data-narrow={narrow}
      ref={bar}
      style={{ maxWidth: narrow ? Math.min(window.screen.width, narrowWidth) : window.screen.width, width: full ? window.screen.width : undefined }}
      onContextMenu={openMenu}
      {...edgeDrag}
    >
      <GlassLayer active={glass} onUnavailable={onGlassUnavailable} />
      <div className="dock__scroll" ref={placed.row} onWheel={glide}>
      {!fullscreen && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragMove={onDragMove} onDragCancel={clearHold} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={folderTarget ? stayPut : horizontalListSortingStrategy}>
            {coming.rows.map((id) => {
              const def = byId(id);
              const gone = coming.leaving.get(id);
              const target = folderTarget === id || placed.folderTarget === id;
              return def ? <Slot key={id} def={def} free={placed.free(id)} arriving={coming.arrived.has(id)} leavingWidth={gone?.width} folderTarget={target} /> : null;
            })}
          </SortableContext>
        </DndContext>
      )}
      </div>
      {!(lockDock && !pickerOpen) && (
        <>
          <div role="separator" aria-orientation="horizontal" aria-label="Top border" className="dock__grip dock__grip--top" />
          <div role="separator" aria-orientation="horizontal" aria-label="Bottom border" className="dock__grip dock__grip--bottom" />
        </>
      )}
      {canResize && <End side="left" bar={bar} />}
      {canResize && <End side="right" bar={bar} />}
    </div>
  );
}
