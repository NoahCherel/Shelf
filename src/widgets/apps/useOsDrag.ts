import { useEffect, useRef, useState, type RefObject } from "react";
import { invoke, listen } from "../../core/tauri";
import { dropAim, RAISE_MS } from "./drag";
import type { AppEntry } from "./entry";

/**
 * Something dragged from Windows: the dock opens a place for it or offers the app under it, says so
 * in a bubble, and tells Rust what letting go would do. An app it stays on comes forward.
 */
export function useOsDrag(box: RefObject<HTMLDivElement | null>, entries: AppEntry[] | null | undefined, preview?: boolean) {
  const [gap, setGap] = useState<number | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const latest = useRef(entries);
  latest.current = entries;
  useEffect(() => {
    if (preview) return;
    let aim: string | null = null;
    let dragging = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = listen<{ x: number; y: number; pinnable: boolean } | null>("os-drag", (at) => {
      if (!at) {
        clearTimeout(timer);
        if (dragging) {
          invoke("apps_drag_target", { key: null, index: null }).catch(() => {});
          invoke("preview_hide").catch(() => {});
        }
        dragging = false;
        aim = null;
        setGap(null);
        setIcon(null);
        return;
      }
      if (!dragging) {
        dragging = true;
        Promise.resolve(invoke<string | null>("apps_drag_icon")).then((found) => setIcon(found ?? null), () => {});
      }
      const el = box.current;
      if (!el) return;
      const x = at.x / (window.devicePixelRatio || 1);
      const rect = (t: Element) => t.getBoundingClientRect();
      const tiles = [...el.querySelectorAll("[data-key]:not(.app--leaving)")].map((t) => ({ key: (t as HTMLElement).dataset.key!, left: rect(t).left, width: rect(t).width }));
      const open = el.querySelector(".app--gap");
      const openGap = open ? { left: rect(open).left, width: rect(open).width, index: Number((open as HTMLElement).dataset.index) } : null;
      const entry = (key: string) => latest.current?.find((e) => e.key === key);
      const next = dropAim(x, tiles, openGap, rect(el), at.pinnable, (key) => (entry(key)?.kind ?? "app") === "app");
      const id = JSON.stringify(next);
      if (id === aim) return;
      aim = id;
      clearTimeout(timer);
      if ("open" in next) {
        const tile = tiles.find((t) => t.key === next.open)!;
        setGap(null);
        invoke("apps_drag_target", { key: next.open, index: null }).catch(() => {});
        invoke("preview_hint", { what: "open", key: next.open, tileX: tile.left, tileWidth: tile.width }).catch(() => {});
        if (entry(next.open)?.windows.length) timer = setTimeout(() => invoke("apps_drag_raise", { key: next.open }).catch(() => {}), RAISE_MS);
      } else {
        setGap(next.place);
        invoke("apps_drag_target", { key: null, index: next.place }).catch(() => {});
        invoke("preview_hint", { what: "add", key: null, tileX: x, tileWidth: 0 }).catch(() => {});
      }
    });
    return () => {
      clearTimeout(timer);
      off.then((stop) => stop());
    };
  }, [preview, box]);
  return { gap, icon };
}
