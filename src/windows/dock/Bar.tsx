import { useComeAndGo } from "../../core/useComeAndGo";
import { CARD } from "../../core/names";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { byId } from "../../core/byId";
import { useLayout } from "../../core/layout";
import { arrange, fractionAt } from "./arrange";
import { useSettings, type SettingsData } from "../../core/settings";
import { usePicker, useShell } from "../../core/shell";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import type { WidgetDef } from "../../core/widget";
import { GlassLayer } from "../../design/glass/GlassLayer";
import { usesGlass } from "../../design/theme";
import { openPanel } from "../../panels/open";
import "./dock.css";

const DEFAULT_CARD_WIDTH = 340;
const DEFAULT_CARD_HEIGHT = 300;
const MENU_WIDTH = 210;
const MENU_HEIGHT = 190;
/** A press that moves less than this is a click. */
const DRAG_DISTANCE = 6;

type Edge = SettingsData["edge"];

/** Tells Rust how big the bar is and how it should sit on the screen. */
export function reportSize(el: HTMLElement, gap: number, float: boolean, edge: Edge, along: number): void {
  const { width, height } = el.getBoundingClientRect();
  invoke("set_dock_width", { width, bar: Math.ceil(height), gap, float, edge, along }).catch(() => {});
}

export function edgeAt(screenY: number, screenHeight: number): Edge {
  return screenY < screenHeight / 2 ? "top" : "bottom";
}

/** Dragging by an empty spot moves the dock: a pill goes anywhere along its edge, and letting go settles it on the nearer edge. */
function useEdgeDrag() {
  const start = useRef<{ x: number; y: number; left: number; width: number } | null>(null);
  const moved = useRef(false);
  return {
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      const { lockDock } = useSettings.getState();
      // The row the tiles sit in is empty room too, between and around them, and the borders are handles.
      const target = (e.target as HTMLElement).classList;
      const empty = e.target === e.currentTarget || target?.contains("dock__scroll") || target?.contains("dock__grip");
      if (e.button !== 0 || !empty || (lockDock && !usePicker.getState().open)) return;
      start.current = { x: e.screenX, y: e.screenY, left: window.screenX, width: e.currentTarget.getBoundingClientRect().width };
      moved.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      if (start.current === null) return;
      const full = useSettings.getState().dockWidth === "full";
      const dx = full ? 0 : e.screenX - start.current.x;
      const dy = e.screenY - start.current.y;
      if (!moved.current && Math.hypot(dx, dy) < DRAG_DISTANCE) return;
      moved.current = true;
      invoke("dock_drag", { dx, dy }).catch(() => {});
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>) {
      const from = start.current;
      if (from === null) return;
      start.current = null;
      if (!moved.current) return;
      const edge = edgeAt(e.screenY, window.screen.height);
      if (useSettings.getState().dockWidth === "full") useSettings.getState().update({ edge });
      else {
        const room = window.screen.width - from.width;
        const left = from.left + e.screenX - from.x;
        useSettings.getState().update({ edge, pillAt: room > 0 ? Math.min(1, Math.max(0, left / room)) : 0.5 });
      }
      invoke("dock_drag_end").catch(() => {});
    },
    // Windows can take the pointer away mid-drag, with no pointerup: the dock goes back where it was,
    // and Rust stops treating it as moving.
    onLostPointerCapture() {
      if (start.current === null) return;
      start.current = null;
      if (moved.current) invoke("dock_drag_end").catch(() => {});
    },
  };
}

export function handleDragEnd({ active, over }: { active: { id: unknown }; over: { id: unknown } | null }): void {
  if (!over || active.id === over.id) return;
  const { ids, move } = useLayout.getState();
  move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
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

/** As long as the fold in dock.css. */
/** On a full-width dock: where the slot sits, and how to start moving it. */
interface Free {
  left: number;
  moving: boolean;
  grab: (e: PointerEvent<HTMLDivElement>) => void;
}

function Slot({ def, free, arriving, leavingWidth }: { def: WidgetDef; free?: Free; arriving?: boolean; leavingWidth?: number }) {
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
      ref={ref}
      className={`slot${def.id === "apps" ? " slot--shrink" : ""}${arriving ? " slot--new" : ""}${leaving ? " slot--leaving" : ""}`}
      aria-hidden={leaving || undefined}
      data-widget-id={def.id}
      data-status={status}
      data-locked={locked}
      data-dragging={isDragging}
      data-moving={free?.moving}
      style={{
        ...(free ? { left: free.left } : { transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined, transition }),
        ...(leaving ? ({ "--w": `${leavingWidth}px` } as React.CSSProperties) : {}),
      }}
      onClick={leaving ? undefined : openCard}
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

const same = (a: Record<string, number>, b: Record<string, number>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);

/**
 * On a full-width dock, each widget sits where it was put and can be dragged anywhere along it.
 * Widths are measured, so neighbours only move as much as they must not to overlap.
 */
function useFreePlacement(full: boolean, ids: string[], locked: boolean) {
  const row = useRef<HTMLDivElement>(null);
  const positions = useLayout((s) => s.positions);
  const [size, setSize] = useState<{ width: number; gap: number; items: Record<string, number> }>({ width: 0, gap: 0, items: {} });
  const [moving, setMoving] = useState<{ id: string; left: number } | null>(null);

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const items = Object.fromEntries(
      [...el.querySelectorAll<HTMLElement>(":scope > [data-widget-id]")].map((slot) => [slot.dataset.widgetId!, slot.getBoundingClientRect().width]),
    );
    const width = el.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    setSize((now) => (now.width === width && now.gap === gap && same(now.items, items) ? now : { width, gap, items }));
  }, []);

  useLayoutEffect(() => {
    if (full) measure();
  });

  // Tiles change size on their own, as when an app opens.
  useEffect(() => {
    const el = row.current;
    if (!full || !el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.querySelectorAll(":scope > [data-widget-id]").forEach((slot) => observer.observe(slot));
    return () => observer.disconnect();
  }, [full, ids, measure]);

  const lefts = full ? arrange(ids.filter((id) => size.items[id] !== undefined).map((id) => ({ id, width: size.items[id], at: positions[id] })), size.width, size.gap) : {};
  // A widget folding away is no longer laid out, so it keeps the last place it had.
  const last = useRef<Record<string, number>>({});
  last.current = { ...last.current, ...lefts };

  const grab = (id: string) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || locked) return;
    const el = e.currentTarget;
    const startX = e.clientX;
    const base = lefts[id] ?? 0;
    const width = size.items[id] ?? 0;
    const leftAt = (x: number) => Math.min(Math.max(0, size.width - width), Math.max(0, base + x - startX));
    let moved = false;
    const move = (ev: globalThis.PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < DRAG_DISTANCE) return;
      // Only now: taking the pointer at the press would send the click to the slot, not the button inside it.
      if (!moved) el.setPointerCapture?.(ev.pointerId);
      moved = true;
      setMoving({ id, left: leftAt(ev.clientX) });
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMoving(null);
    };
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointercancel", cancel);
      setMoving(null);
      if (!moved) return;
      const left = leftAt(ev.clientX);
      const order = [...ids].sort((a, b) => (a === id ? left : (lefts[a] ?? 0)) - (b === id ? left : (lefts[b] ?? 0)));
      useLayout.getState().place(id, fractionAt(left, width, size.width), order);
      // The click that follows letting go isn't a click on the widget.
      const swallow = (click: Event) => {
        click.stopPropagation();
        click.preventDefault();
      };
      el.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 0);
    };
    // On the window, as the pointer can leave the slot before it counts as a drag.
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    // A drag Windows cuts short leaves the widget where it was.
    window.addEventListener("pointercancel", cancel, { once: true });
  };

  return {
    row,
    free: (id: string): Free | undefined =>
      full ? { left: moving?.id === id ? moving.left : (lefts[id] ?? last.current[id] ?? 0), moving: moving?.id === id, grab: grab(id) } : undefined,
  };
}

export function DockBar() {
  const ids = useLayout((s) => s.ids);
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            {coming.rows.map((id) => {
              const def = byId(id);
              const gone = coming.leaving.get(id);
              return def ? <Slot key={id} def={def} free={placed.free(id)} arriving={coming.arrived.has(id)} leavingWidth={gone?.width} /> : null;
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
