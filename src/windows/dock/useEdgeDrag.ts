import { useRef, type PointerEvent } from "react";
import { DRAG_DISTANCE } from "../../core/gestures";
import { useSettings, type SettingsData } from "../../core/settings";
import { usePicker } from "../../core/shell";
import { invoke } from "../../core/tauri";

type Edge = SettingsData["edge"];

export function edgeAt(screenY: number, screenHeight: number): Edge {
  return screenY < screenHeight / 2 ? "top" : "bottom";
}

/** Dragging by an empty spot moves the dock: a pill goes anywhere along its edge, and letting go settles it on the nearer edge. */
export function useEdgeDrag() {
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
