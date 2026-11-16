import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { useSettings } from "../../core/settings";
import { CARD } from "../../core/names";
import { usePicker } from "../../core/shell";
import { invoke, listen } from "../../core/tauri";
import { openPanel } from "../../panels/open";
import type { TileProps } from "../../core/widget";
import { BUBBLE_STEP, DRAG_DISTANCE, dragOutcome, heldOver, HOLD_MS, isPulledOff, keptInside } from "./drag";
import { markReordered, type AppEntry } from "./entry";
import { AppIcon, GroupIcon, SearchGlyph, StartLogo, useStartImage } from "./icons";
import { useAppPreviews } from "./useAppPreviews";
import { useComeAndGo } from "../../core/useComeAndGo";
import { useOsDrag } from "./useOsDrag";
import { useKeyNav } from "./keyNav";
import "./apps.css";

/** While an app is held over another, the others stop making room for it. */
const stayPut = () => null;

function Sortable({ id, disabled, children }: { id: string; disabled: boolean; children: (s: ReturnType<typeof useSortable>) => ReactNode }) {
  return <>{children(useSortable({ id, disabled }))}</>;
}

const tileSize = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--T")) || 50;

const APP_MENU_WIDTH = 300;
const APP_MENU_HEIGHT = 120;

export function AppsTile({ data: fetched, preview, refresh }: TileProps<AppEntry[]>) {
  // Shown in its new order straight away, until Rust sends the list in that order.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => setOrder(null), [fetched]);
  const data = useMemo(() => (order && fetched ? [...fetched].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)) : fetched), [fetched, order]);
  const previews = useAppPreviews(preview);
  const startImage = useStartImage(preview);
  const box = useRef<HTMLDivElement>(null);
  const osDrag = useOsDrag(box, data, preview);
  const keyNav = useKeyNav(data, preview);
  const { rows, arrived } = useComeAndGo(data, (e) => e.key, undefined, preview);
  const present = new Set((data ?? []).map((e) => e.key));
  const pickerOpen = usePicker((s) => s.open);
  const lockDock = useSettings((s) => s.lockDock);
  const canDrag = !preview && !pickerOpen && !lockDock;
  const [pulledOff, setPulledOff] = useState<string | null>(null);
  const dragged = useRef(false);
  const keepInside = ({ transform, activeNodeRect }: { transform: { x: number; y: number; scaleX: number; scaleY: number }; activeNodeRect: { left: number; width: number } | null }) => {
    const bounds = box.current?.getBoundingClientRect();
    return activeNodeRect && bounds ? { ...transform, x: keptInside(transform.x, activeNodeRect, bounds) } : transform;
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE } }));
  // The app another is being held over, which steps back under it to show a group would be made.
  const [onto, setOnto] = useState<string | null>(null);
  const hold = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const stopHolding = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
    setOnto(null);
  };
  useEffect(() => () => {
    if (hold.current) clearTimeout(hold.current.timer);
  }, []);
  // The bubble over an app pulled off the dock, following it by steps.
  const bubbleAt = useRef<number | null>(null);
  const showRemoving = (off: boolean, key?: string, at?: { left: number; width: number } | null) => {
    if (!off || !at) {
      if (bubbleAt.current !== null) invoke("preview_hide").catch(() => {});
      bubbleAt.current = null;
      return;
    }
    const step = Math.round(at.left / BUBBLE_STEP);
    if (step === bubbleAt.current) return;
    bubbleAt.current = step;
    invoke("preview_hint", { what: "remove", key, tileX: at.left, tileWidth: at.width }).catch(() => {});
  };
  const onDragMove = (e: DragMoveEvent) => {
    const T = tileSize();
    const moving = (data ?? []).find((a) => a.key === String(e.active.id));
    const off = isPulledOff(e.delta.y, T) && !!moving?.pinned;
    setPulledOff(off ? String(e.active.id) : null);
    showRemoving(off, String(e.active.id), e.active.rect.current.translated);
    const moved = e.active.rect.current.translated;
    const target = e.over && String(e.over.id) !== String(e.active.id) ? String(e.over.id) : null;
    const near = !off && target !== null && moved !== null && heldOver(moved, e.over!.rect, T);
    if (!near) return stopHolding();
    if (hold.current?.key === target) return;
    stopHolding();
    hold.current = { key: target, timer: setTimeout(() => setOnto(target), HOLD_MS) };
  };
  const onDragEnd = (e: DragEndEvent) => {
    setPulledOff(null);
    showRemoving(false);
    dragged.current = true;
    const result = dragOutcome({ active: String(e.active.id), over: e.over ? String(e.over.id) : null, dy: e.delta.y, onto }, data ?? [], tileSize());
    stopHolding();
    if (result?.kind === "group") {
      invoke("apps_group", { onto: result.onto, dragged: result.key })
        .then(() => {
          markReordered();
          refresh?.();
        })
        .catch(() => {});
    } else if (result?.kind === "reorder") {
      setOrder(result.keys);
      invoke("apps_reorder", { keys: result.keys })
        .then(() => {
          markReordered();
          refresh?.();
        })
        .catch(() => setOrder(null));
    } else if (result?.kind === "unpin") {
      invoke("apps_unpin", { key: result.key })
        .then(() => refresh?.())
        .catch(() => {});
    }
  };
  const [startOpen, setStartOpen] = useState(false);
  useEffect(() => {
    if (preview) return;
    const off = listen<boolean>("start-open", setStartOpen);
    return () => {
      off.then((stop) => stop());
    };
  }, [preview]);
  const windowsMenu = (e: MouseEvent, command: string, args?: Record<string, unknown>) => {
    if (preview) return;
    // This is Windows' menu to show, not Shelf's.
    e.preventDefault();
    e.stopPropagation();
    invoke(command, args).catch(() => {});
  };
  const placeOf = new Map(rows.filter((e) => present.has(e.key)).map((e, i) => [e.key, i]));
  const gapTile = osDrag.gap !== null && (
    <span className="app app--gap" data-index={osDrag.gap} aria-hidden="true">
      {osDrag.icon ? <img className="app__icon" src={osDrag.icon} alt="" draggable={false} /> : <span className="app__icon app__icon--blank" />}
    </span>
  );
  return (
    <div className="apps" ref={box}>
      <button
        type="button"
        className={startOpen ? "app app--active" : "app"}
        aria-label="Start"
        title="Start"
        onClick={() => !preview && invoke("start_menu").catch(() => {})}
        onContextMenu={(e) => windowsMenu(e, "start_quick_menu")}
      >
        {startImage ? <img className="app__icon app__icon--start" src={startImage} alt="" draggable={false} /> : <StartLogo />}
      </button>
      <button
        type="button"
        className="app"
        aria-label="Search"
        title="Search"
        data-panel="search"
        onClick={(e) => !preview && openPanel("search", e.currentTarget)}
      >
        <SearchGlyph />
      </button>
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[keepInside]} onDragStart={() => invoke("preview_hide").catch(() => {})} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => {
        setPulledOff(null);
        showRemoving(false);
        stopHolding();
      }}>
      <SortableContext items={rows.filter((e) => present.has(e.key)).map((e) => e.key)} strategy={onto || pulledOff ? stayPut : horizontalListSortingStrategy}>
      {rows.map((entry) => (
        <Fragment key={entry.key}>
        {osDrag.gap === placeOf.get(entry.key) && gapTile}
        {!present.has(entry.key) && !preview ? (
          <span key={entry.key} className="app app--leaving" data-key={entry.key} aria-hidden="true">
            {entry.kind === "group" ? <GroupIcon entry={entry} /> : <AppIcon entry={entry} />}
          </span>
        ) : (
        <Sortable key={entry.key} id={entry.key} disabled={!canDrag}>
        {(sortable) => (
        <button
          type="button"
          ref={sortable.setNodeRef}
          data-key={entry.key}
          data-dragging={sortable.isDragging}
          style={{ transform: sortable.transform ? `translate3d(${sortable.transform.x}px, 0, 0)` : undefined, transition: sortable.transition }}
          className={`app${entry.active ? " app--active" : ""}${entry.windows.length > 1 && entry.kind !== "group" ? " app--many" : ""}${arrived.has(entry.key) ? " app--new" : ""}${pulledOff === entry.key ? " app--off" : ""}${onto === entry.key ? " app--onto" : ""}${keyNav.focused === entry.key ? " app--keyfocus" : ""}`}
          aria-label={entry.name}
          onMouseEnter={(e) => previews.enter(e, entry)}
          onMouseLeave={previews.leave}
          onMouseDown={() => previews.press(entry)}
          onPointerDown={(e) => {
            // Apps move along the dock; the widget itself is moved by Start or Search.
            e.stopPropagation();
            sortable.listeners?.onPointerDown?.(e);
          }}
          onClick={(e) => {
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            if (preview) return;
            if (entry.kind === "group" || entry.kind === "folder") {
              const r = e.currentTarget.getBoundingClientRect();
              const prefix = entry.kind === "group" ? CARD.group : CARD.stack;
              invoke("open_card", { widgetId: `${prefix}${entry.key}`, tileX: r.left, tileWidth: r.width, width: APP_MENU_WIDTH, height: APP_MENU_HEIGHT }).catch(() => {});
            } else if (entry.windows.length > 1) previews.toggle(e, entry);
            else invoke("apps_activate", { key: entry.key }).catch(() => {});
          }}
          onContextMenu={(e) => {
            if (preview) return;
            e.preventDefault();
            e.stopPropagation();
            previews.press({ ...entry, windows: [] });
            const r = e.currentTarget.getBoundingClientRect();
            invoke("open_card", { widgetId: `${CARD.appMenu}${entry.key}`, tileX: r.left, tileWidth: r.width, width: APP_MENU_WIDTH, height: APP_MENU_HEIGHT }).catch(() => {});
          }}
        >
          {entry.kind === "group" ? <GroupIcon entry={entry} preview={preview} /> : <AppIcon entry={entry} preview={preview} />}
          {entry.windows.length > 0 && <span className="app__dot" />}
        </button>
        )}
        </Sortable>
        )}
        </Fragment>
      ))}
      {osDrag.gap !== null && osDrag.gap >= placeOf.size && gapTile}
      </SortableContext>
      </DndContext>
    </div>
  );
}
