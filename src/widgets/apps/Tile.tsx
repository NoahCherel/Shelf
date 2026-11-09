import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { useSettings } from "../../core/settings";
import { usePicker } from "../../core/shell";
import { invoke, listen } from "../../core/tauri";
import { openPanel } from "../../panels";
import type { TileProps } from "../../core/widget";
import "./apps.css";

export interface AppEntry {
  key: string;
  name: string;
  pinned: boolean;
  active: boolean;
  windows: { hwnd: number; title: string }[];
  /** An app when absent. */
  kind?: "app" | "file" | "folder" | "group";
  /** A group's apps. */
  members?: AppEntry[];
}

/** Keeps icons where they are as focus changes; new apps go last, closed ones drop out. */
export function stableOrder(previous: AppEntry[], next: AppEntry[]): AppEntry[] {
  const byKey = new Map(next.map((e) => [e.key, e]));
  const kept = previous.flatMap((e) => {
    const current = byKey.get(e.key);
    return current ? [current] : [];
  });
  const known = new Set(previous.map((e) => e.key));
  return [...kept, ...next.filter((e) => !known.has(e.key))];
}

let reordered = false;

/** The apps were just dragged into a new order, so the next list from Rust is taken as it comes. */
export function markReordered(): void {
  reordered = true;
}

export function takeReordered(): boolean {
  const was = reordered;
  reordered = false;
  return was;
}

/** Pulled further off the dock than this share of a tile, a pinned app is unpinned. */
const PULL_OFF = 0.9;
/** A press that moves less than this is a click. */
const DRAG_DISTANCE = 6;

export function isPulledOff(dy: number, T: number): boolean {
  return Math.abs(dy) > T * PULL_OFF;
}

/** How near the middle of another app, as a share of a tile, counts as being held over it. */
const HOLD_NEAR = 0.3;
/** How long an app has to stay over another to make a group: a pause, not a passing drag. */
const HOLD_MS = 700;
/** How long something dragged from Windows stays over an app before that app comes to the front. */
const RAISE_MS = 700;

export function heldOver(dragged: { left: number; width: number }, over: { left: number; width: number }, T: number): boolean {
  return Math.abs(dragged.left + dragged.width / 2 - (over.left + over.width / 2)) < T * HOLD_NEAR;
}

/** Only apps go in groups, and they go on another app or a group. */
export function canGroup(dragged: AppEntry, onto: AppEntry): boolean {
  const app = (e: AppEntry) => (e.kind ?? "app") === "app";
  return dragged.key !== onto.key && app(dragged) && (app(onto) || onto.kind === "group");
}

/** The tile of the dock an element is part of. */
export function appUnder(element: Element | null): string | null {
  return element?.closest<HTMLElement>("[data-key]")?.dataset.key ?? null;
}

export type DragResult = { kind: "reorder"; keys: string[] } | { kind: "unpin"; key: string } | { kind: "group"; onto: string; key: string } | null;

/** What letting go of a dragged app does. Only a pinned app can be pulled off. */
export function dragOutcome(drag: { active: string; over: string | null; dy: number; onto?: string | null }, entries: AppEntry[], T: number): DragResult {
  const dragged = entries.find((e) => e.key === drag.active);
  if (!dragged) return null;
  if (isPulledOff(drag.dy, T)) return dragged.pinned ? { kind: "unpin", key: dragged.key } : null;
  const onto = entries.find((e) => e.key === drag.onto);
  if (onto && canGroup(dragged, onto)) return { kind: "group", onto: onto.key, key: dragged.key };
  if (!drag.over || drag.over === drag.active) return null;
  const keys = entries.map((e) => e.key);
  return { kind: "reorder", keys: arrayMove(keys, keys.indexOf(drag.active), keys.indexOf(drag.over)) };
}

/** How far along an app may be dragged: its tile clips what's past its ends, so it stops at them. */
export function keptInside(dx: number, icon: { left: number; width: number }, box: { left: number; right: number }): number {
  return Math.min(box.right - icon.left - icon.width, Math.max(box.left - icon.left, dx));
}

/** While an app is held over another, the others stop making room for it. */
const stayPut = () => null;

function Sortable({ id, disabled, children }: { id: string; disabled: boolean; children: (s: ReturnType<typeof useSortable>) => ReactNode }) {
  return <>{children(useSortable({ id, disabled }))}</>;
}

const tileSize = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--T")) || 50;

const APP_MENU_PREFIX = "__appmenu:";
const APP_MENU_WIDTH = 300;
const APP_MENU_HEIGHT = 120;
const GROUP_PREFIX = "__group:";
const STACK_PREFIX = "__stack:";
/** As long as the fold in apps.css. */
const FOLD_MS = 300;
const PREVIEW_PAUSE_MS = 350;
const ICON_RETRY_MS = 2500;
const ICON_TRIES = 6;

const icons = new Map<string, Promise<string | null>>();

function iconFor(key: string): Promise<string | null> {
  let icon = icons.get(key);
  if (!icon) {
    icon = invoke<string | null>("apps_icon", { key }).catch(() => null);
    icons.set(key, icon);
    // Only found icons are kept, so a miss can be asked again.
    icon.then((found) => found || icons.delete(key));
  }
  return icon;
}

function AppIcon({ entry, preview }: { entry: AppEntry; preview?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (preview) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    const attempt = () => {
      iconFor(entry.key).then((icon) => {
        if (!live) return;
        if (icon) setSrc(icon);
        else if (++tries < ICON_TRIES) timer = setTimeout(attempt, ICON_RETRY_MS);
      });
    };
    attempt();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [entry.key, preview]);
  if (src) return <img className="app__icon" src={src} alt="" draggable={false} />;
  return <span className="app__icon app__icon--blank">{entry.name.charAt(0).toUpperCase()}</span>;
}

/** A group's tile: a few of its apps in miniature. */
function GroupIcon({ entry, preview }: { entry: AppEntry; preview?: boolean }) {
  return (
    <span className="app__icon app__group">
      {(entry.members ?? []).slice(0, 4).map((member) => (
        <span className="app__mini" key={member.key}>
          <AppIcon entry={member} preview={preview} />
        </span>
      ))}
    </span>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 30 30" className="app__icon app__icon--search" aria-hidden="true">
      <circle cx="13.500" cy="13.500" r="7.500" fill="none" stroke="currentColor" strokeWidth="2.600" />
      <path d="M19.300 19.300 25 25" stroke="currentColor" strokeWidth="2.800" strokeLinecap="round" />
    </svg>
  );
}

function StartLogo() {
  return (
    <svg viewBox="0 0 30 30" className="app__icon" aria-hidden="true">
      <defs>
        <linearGradient id="start-pane" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2f2f4" />
          <stop offset="1" stopColor="#a7a8ad" />
        </linearGradient>
      </defs>
      <rect width="30" height="30" rx="7" fill="#1b1b1d" />
      <rect x="0.5" y="0.5" width="29" height="29" rx="6.5" fill="none" stroke="#ffffff" strokeOpacity="0.14" />
      <g fill="url(#start-pane)">
        <rect x="7.5" y="7.5" width="7" height="7" rx="1" />
        <rect x="15.5" y="7.5" width="7" height="7" rx="1" />
        <rect x="7.5" y="15.5" width="7" height="7" rx="1" />
        <rect x="15.5" y="15.5" width="7" height="7" rx="1" />
      </g>
    </svg>
  );
}

/** Previews after a pause over an open app, and straight away once they're already showing. */
function useAppPreviews(preview?: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showing = useRef(false);
  useEffect(() => {
    if (preview) return;
    const off = listen("preview-closed", () => {
      showing.current = false;
    });
    return () => {
      clearTimeout(timer.current);
      off.then((stop) => stop());
    };
  }, [preview]);
  const enter = (e: MouseEvent<HTMLElement>, entry: AppEntry) => {
    if (preview) return;
    const { hoverNames, previews: showPreviews } = useSettings.getState();
    // An open app shows its windows; one that isn't, or with previews off, shows its name.
    const command = showPreviews && entry.windows.length > 0 && entry.kind !== "group" ? "preview_show" : hoverNames ? "preview_name" : null;
    if (!command) return;
    const r = e.currentTarget.getBoundingClientRect();
    const show = () => {
      showing.current = true;
      invoke(command, { key: entry.key, tileX: r.left, tileWidth: r.width }).catch(() => {});
    };
    clearTimeout(timer.current);
    if (showing.current) show();
    else timer.current = setTimeout(show, PREVIEW_PAUSE_MS);
  };
  const leave = () => {
    clearTimeout(timer.current);
    if (showing.current) invoke("preview_leave").catch(() => {});
  };
  const press = (entry: AppEntry) => {
    if (preview) return;
    clearTimeout(timer.current);
    // With several windows the click that follows decides, as it does on Windows.
    if (entry.windows.length > 1 && entry.kind !== "group") return;
    showing.current = false;
    invoke("preview_hide").catch(() => {});
  };
  /** Several windows: a click shows them all, and another closes them. */
  const toggle = (e: MouseEvent<HTMLElement>, entry: AppEntry) => {
    if (showing.current) {
      showing.current = false;
      invoke("preview_hide").catch(() => {});
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    showing.current = true;
    invoke("preview_show", { key: entry.key, tileX: r.left, tileWidth: r.width }).catch(() => {});
  };
  return { enter, leave, press, toggle };
}

/** Something dragged from Windows: Rust is told which app it's over, and an app it stays on comes forward. */
function useOsDrag(preview?: boolean) {
  useEffect(() => {
    if (preview) return;
    let over: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = listen<[number, number] | null>("os-drag", (at) => {
      const scale = window.devicePixelRatio || 1;
      const key = at ? appUnder(document.elementFromPoint(at[0] / scale, at[1] / scale)) : null;
      if (key === over) return;
      over = key;
      clearTimeout(timer);
      invoke("apps_drag_target", { key }).catch(() => {});
      if (key) timer = setTimeout(() => invoke("apps_drag_raise", { key }).catch(() => {}), RAISE_MS);
    });
    return () => {
      clearTimeout(timer);
      off.then((stop) => stop());
    };
  }, [preview]);
}

/** Apps that have turned up since the dock first loaded, for as long as they stay. */
function useArrivals(entries: AppEntry[] | null, preview?: boolean): Set<string> {
  const known = useRef<Set<string> | null>(null);
  const arrived = useRef(new Set<string>());
  if (entries && !preview) {
    const now = new Set(entries.map((e) => e.key));
    for (const key of now) if (known.current && !known.current.has(key)) arrived.current.add(key);
    for (const key of arrived.current) if (!now.has(key)) arrived.current.delete(key);
    known.current = now;
  }
  return arrived.current;
}

/** Apps just gone, kept where they were for the moment they take to fold away. */
function useLeaving(entries: AppEntry[] | null, preview?: boolean): AppEntry[] {
  const [, redraw] = useState(0);
  const last = useRef<AppEntry[] | null>(null);
  const leaving = useRef(new Map<string, { entry: AppEntry; index: number }>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  if (entries && !preview) {
    const now = new Set(entries.map((e) => e.key));
    last.current?.forEach((entry, index) => {
      if (!now.has(entry.key)) leaving.current.set(entry.key, { entry, index });
    });
    for (const key of now) leaving.current.delete(key);
    last.current = entries;
  }

  useEffect(() => {
    for (const [key, timer] of timers.current) {
      if (!leaving.current.has(key)) {
        clearTimeout(timer);
        timers.current.delete(key);
      }
    }
    for (const key of leaving.current.keys()) {
      if (timers.current.has(key)) continue;
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          leaving.current.delete(key);
          redraw((n) => n + 1);
        }, FOLD_MS),
      );
    }
  });

  useEffect(() => {
    const running = timers.current;
    return () => {
      running.forEach(clearTimeout);
      running.clear();
    };
  }, []);

  const rows = [...(entries ?? [])];
  [...leaving.current.values()]
    .sort((a, b) => a.index - b.index)
    .forEach(({ entry, index }) => rows.splice(Math.min(index, rows.length), 0, entry));
  return rows;
}

export function AppsTile({ data: fetched, preview, refresh }: TileProps<AppEntry[]>) {
  // Shown in its new order straight away, until Rust sends the list in that order.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => setOrder(null), [fetched]);
  const data = useMemo(() => (order && fetched ? [...fetched].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)) : fetched), [fetched, order]);
  const previews = useAppPreviews(preview);
  useOsDrag(preview);
  const arrived = useArrivals(data, preview);
  const rows = useLeaving(data, preview);
  const present = new Set((data ?? []).map((e) => e.key));
  const pickerOpen = usePicker((s) => s.open);
  const lockDock = useSettings((s) => s.lockDock);
  const canDrag = !preview && !pickerOpen && !lockDock;
  const [pulledOff, setPulledOff] = useState<string | null>(null);
  const dragged = useRef(false);
  const box = useRef<HTMLDivElement>(null);
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
  const onDragMove = (e: DragMoveEvent) => {
    const T = tileSize();
    const off = isPulledOff(e.delta.y, T);
    setPulledOff(off ? String(e.active.id) : null);
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
        <StartLogo />
      </button>
      <button
        type="button"
        className="app"
        aria-label="Search"
        title="Search"
        onClick={(e) => !preview && openPanel("search", e.currentTarget)}
      >
        <SearchGlyph />
      </button>
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[keepInside]} onDragStart={() => invoke("preview_hide").catch(() => {})} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => {
        setPulledOff(null);
        stopHolding();
      }}>
      <SortableContext items={rows.filter((e) => present.has(e.key)).map((e) => e.key)} strategy={onto ? stayPut : horizontalListSortingStrategy}>
      {rows.map((entry) =>
        !present.has(entry.key) && !preview ? (
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
          className={`app${entry.active ? " app--active" : ""}${entry.windows.length > 1 && entry.kind !== "group" ? " app--many" : ""}${arrived.has(entry.key) ? " app--new" : ""}${pulledOff === entry.key ? " app--off" : ""}${onto === entry.key ? " app--onto" : ""}`}
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
              const prefix = entry.kind === "group" ? GROUP_PREFIX : STACK_PREFIX;
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
            invoke("open_card", { widgetId: `${APP_MENU_PREFIX}${entry.key}`, tileX: r.left, tileWidth: r.width, width: APP_MENU_WIDTH, height: APP_MENU_HEIGHT }).catch(() => {});
          }}
        >
          {entry.kind === "group" ? <GroupIcon entry={entry} preview={preview} /> : <AppIcon entry={entry} preview={preview} />}
          {entry.windows.length > 0 && <span className="app__dot" />}
        </button>
        )}
        </Sortable>
        ),
      )}
      </SortableContext>
      </DndContext>
    </div>
  );
}
