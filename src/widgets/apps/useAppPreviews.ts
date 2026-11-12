import { useEffect, useRef, type MouseEvent } from "react";
import { useSettings } from "../../core/settings";
import { invoke, listen } from "../../core/tauri";
import type { AppEntry } from "./entry";

const PREVIEW_PAUSE_MS = 350;

/** Previews after a pause over an open app, and straight away once they're already showing. */
export function useAppPreviews(preview?: boolean) {
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
