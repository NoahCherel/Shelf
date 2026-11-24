import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { canPutInFolder, isFolderId } from "../../core/folderId";
import { DRAG_DISTANCE } from "../../core/gestures";
import { useLayout } from "../../core/layout";
import { arrange, fractionAt } from "./arrange";

const WIDGET_HOLD_MS = 350;
const FOLDER_HOLD_MS = 150;

/** On a full-width dock: where the slot sits, and how to start moving it. */
export interface Free {
  left: number;
  moving: boolean;
  grab: (e: PointerEvent<HTMLDivElement>) => void;
}

const same = (a: Record<string, number>, b: Record<string, number>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);

/**
 * On a full-width dock, each widget sits where it was put and can be dragged anywhere along it.
 * Widths are measured, so neighbours only move as much as they must not to overlap.
 */
export function useFreePlacement(full: boolean, ids: string[], locked: boolean) {
  const row = useRef<HTMLDivElement>(null);
  const positions = useLayout((s) => s.positions);
  const [size, setSize] = useState<{ width: number; gap: number; items: Record<string, number> }>({ width: 0, gap: 0, items: {} });
  const [moving, setMoving] = useState<{ id: string; left: number } | null>(null);
  const [folderTarget, setFolderTarget] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holdOver = useRef<string | null>(null);
  const armedTarget = useRef<string | null>(null);

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
    const clearHold = () => {
      clearTimeout(holdTimer.current);
      holdOver.current = null;
      armedTarget.current = null;
      setFolderTarget(null);
    };
    const rowLeft = row.current?.getBoundingClientRect().left ?? 0;
    const findOver = (clientX: number): string | null => {
      if (!canPutInFolder(id)) return null;
      const x = clientX - rowLeft;
      for (const other of ids) {
        if (other === id || other === "apps") continue;
        const oLeft = lefts[other];
        const oWidth = size.items[other];
        if (oLeft === undefined || !oWidth) continue;
        const pad = isFolderId(other) ? 0 : oWidth * 0.15;
        if (x >= oLeft + pad && x <= oLeft + oWidth - pad) return other;
      }
      return null;
    };
    const move = (ev: globalThis.PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < DRAG_DISTANCE) return;
      // Only now: taking the pointer at the press would send the click to the slot, not the button inside it.
      if (!moved) el.setPointerCapture?.(ev.pointerId);
      moved = true;
      const nextLeft = leftAt(ev.clientX);
      setMoving({ id, left: nextLeft });
      const over = findOver(ev.clientX);
      if (!over) {
        if (holdOver.current || armedTarget.current) clearHold();
      } else if (holdOver.current !== over) {
        clearHold();
        holdOver.current = over;
        const delay = isFolderId(over) ? FOLDER_HOLD_MS : WIDGET_HOLD_MS;
        holdTimer.current = setTimeout(() => {
          armedTarget.current = over;
          setFolderTarget(over);
        }, delay);
      }
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      clearHold();
      setMoving(null);
    };
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointercancel", cancel);
      const target = armedTarget.current;
      clearHold();
      setMoving(null);
      if (!moved) return;
      if (target) {
        useLayout.getState().groupWidgets(id, target);
      } else {
        const left = leftAt(ev.clientX);
        const order = [...ids].sort((a, b) => (a === id ? left : (lefts[a] ?? 0)) - (b === id ? left : (lefts[b] ?? 0)));
        useLayout.getState().place(id, fractionAt(left, width, size.width), order);
      }
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
    folderTarget,
    free: (id: string): Free | undefined =>
      full ? { left: moving?.id === id ? moving.left : (lefts[id] ?? last.current[id] ?? 0), moving: moving?.id === id, grab: grab(id) } : undefined,
  };
}
