import { arrayMove } from "@dnd-kit/sortable";
import type { AppEntry } from "./entry";

export { DRAG_DISTANCE } from "../../core/gestures";

/** Pulled further off the dock than this share of a tile, a pinned app is unpinned. */
const PULL_OFF = 0.9;

export function isPulledOff(dy: number, T: number): boolean {
  return Math.abs(dy) > T * PULL_OFF;
}

/** How near the middle of another app, as a share of a tile, counts as being held over it. */
const HOLD_NEAR = 0.3;
/** How long an app has to stay over another to make a group: a pause, not a passing drag. */
export const HOLD_MS = 700;
/** How long something dragged from Windows stays over an app before that app comes to the front. */
export const RAISE_MS = 700;
/** How far an app pulled off the dock moves before its bubble catches up. */
export const BUBBLE_STEP = 12;

export function heldOver(dragged: { left: number; width: number }, over: { left: number; width: number }, T: number): boolean {
  return Math.abs(dragged.left + dragged.width / 2 - (over.left + over.width / 2)) < T * HOLD_NEAR;
}

/** Only apps go in groups, and they go on another app or a group. */
export function canGroup(dragged: AppEntry, onto: AppEntry): boolean {
  const app = (e: AppEntry) => (e.kind ?? "app") === "app";
  return dragged.key !== onto.key && app(dragged) && (app(onto) || onto.kind === "group");
}

export type DropAim = { open: string } | { place: number };

/**
 * What letting go of something from Windows would do at this point along the dock: open in the app
 * at the middle of its icon, or take a place between the icons. A place stays while the pointer is in it.
 */
export function dropAim(
  x: number,
  tiles: { key: string; left: number; width: number }[],
  gap: { left: number; width: number; index: number } | null,
  box: { left: number; right: number },
  pinnable: boolean,
  canOpen: (key: string) => boolean,
): DropAim {
  if (gap && x >= gap.left && x < gap.left + gap.width) return { place: gap.index };
  if (x < box.left || x > box.right) return { place: tiles.length };
  for (const [i, tile] of tiles.entries()) {
    if (x >= tile.left + tile.width) continue;
    if (x < tile.left) return { place: i };
    const middle = tile.left + tile.width / 2;
    if (!pinnable && canOpen(tile.key) && Math.abs(x - middle) < tile.width / 4) return { open: tile.key };
    return { place: x < middle ? i : i + 1 };
  }
  return { place: tiles.length };
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
