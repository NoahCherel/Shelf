import { useRef, type PointerEvent } from "react";
import { DRAG_DISTANCE } from "../../core/gestures";
import { useSettings, type SettingsData } from "../../core/settings";
import { usePicker } from "../../core/shell";
import { invoke } from "../../core/tauri";

type Edge = SettingsData["edge"];

/** Dragging by an empty spot moves the dock: a pill goes anywhere along its edge, and letting go settles it on the nearer edge. */
export function useEdgeDrag() {
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  return {
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      const { lockDock } = useSettings.getState();
      // The row the tiles sit in is empty room too, between and around them, and the borders are handles.
      const target = (e.target as HTMLElement).classList;
      const empty = e.target === e.currentTarget || target?.contains("dock__scroll") || target?.contains("dock__grip");
      if (e.button !== 0 || !empty || (lockDock && !usePicker.getState().open)) return;
      start.current = { x: e.screenX, y: e.screenY };
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
    // Rust says where it settles: the pointer's screen coordinates start at the main screen, so on
    // another screen they can't be compared with this one's size.
    async onPointerUp() {
      if (start.current === null) return;
      start.current = null;
      if (!moved.current) return;
      const settled = await invoke<{ edge: Edge; along: number } | null>("dock_drag_settle").catch(() => null);
      if (settled) {
        const full = useSettings.getState().dockWidth === "full";
        useSettings.getState().update(full ? { edge: settled.edge } : { edge: settled.edge, pillAt: settled.along });
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
