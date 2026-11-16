import { useEffect, useRef, useState } from "react";
import { invoke, listen } from "../../core/tauri";
import type { AppEntry } from "./entry";

/** What Rust's keyboard hook reports during Win+T. */
export type KeyNavEvent = { kind: "start" } | { kind: "move"; step: number } | { kind: "window"; step: number } | { kind: "activate" } | { kind: "cancel" };

/** The app reached, and which of its windows Tab chose; null before any Tab. */
export interface NavState {
  key: string | null;
  window: number | null;
}

export type NavEffect = { kind: "none" } | { kind: "hide" } | { kind: "show"; key: string; hwnd: number } | { kind: "activate"; hwnd: number } | { kind: "end" };

export const IDLE: NavState = { key: null, window: null };

const wrap = (i: number, n: number) => ((i % n) + n) % n;

/** Open apps in dock order. Groups are left out, as their own previews are. */
const reachable = (apps: AppEntry[]) => apps.filter((e) => e.windows.length > 0 && e.kind !== "group");

export function navigate(state: NavState, event: KeyNavEvent, apps: AppEntry[]): { state: NavState; effect: NavEffect } {
  const open = reachable(apps);
  const focused = open.find((e) => e.key === state.key);
  switch (event.kind) {
    case "start": {
      const first = open.find((e) => e.active) ?? open[0];
      return first ? { state: { key: first.key, window: null }, effect: { kind: "none" } } : { state: IDLE, effect: { kind: "end" } };
    }
    case "move": {
      if (open.length === 0) return { state: IDLE, effect: { kind: "end" } };
      // An app that closed meanwhile is gone from the list: the walk starts again from the first.
      const from = focused ? open.indexOf(focused) : -1;
      const next = focused ? wrap(from + event.step, open.length) : 0;
      return { state: { key: open[next].key, window: null }, effect: { kind: state.window === null ? "none" : "hide" } };
    }
    case "window": {
      if (!focused) return { state, effect: { kind: "none" } };
      const window = wrap((state.window ?? 0) + event.step, focused.windows.length);
      return { state: { key: focused.key, window }, effect: { kind: "show", key: focused.key, hwnd: focused.windows[window].hwnd } };
    }
    case "activate": {
      const chosen = focused?.windows[state.window ?? 0];
      return { state: IDLE, effect: chosen ? { kind: "activate", hwnd: chosen.hwnd } : { kind: "hide" } };
    }
    case "cancel":
      return { state: IDLE, effect: { kind: "hide" } };
  }
}

function tileOf(key: string): HTMLElement | undefined {
  // A tile on its way out keeps its key too.
  return [...document.querySelectorAll<HTMLElement>(".app[data-key]:not(.app--leaving)")].find((t) => t.dataset.key === key);
}

function run(effect: NavEffect) {
  switch (effect.kind) {
    case "show": {
      const r = tileOf(effect.key)?.getBoundingClientRect();
      if (!r) return;
      // Shown even with previews off: without them, which window Tab chose couldn't be seen.
      invoke("preview_show", { key: effect.key, tileX: r.left, tileWidth: r.width, fromKeys: true })
        .then(() => invoke("preview_select", { hwnd: effect.hwnd }))
        .catch(() => {});
      return;
    }
    case "hide":
      invoke("preview_hide").catch(() => {});
      return;
    case "activate":
      invoke("preview_activate", { hwnd: effect.hwnd }).catch(() => {});
      return;
    case "end":
      invoke("keynav_end").catch(() => {});
      return;
    case "none":
      return;
  }
}

/** Follows Win+T: which app the keyboard has reached. */
export function useKeyNav(data: AppEntry[] | null | undefined, preview?: boolean): { focused: string | null } {
  const [state, setState] = useState<NavState>(IDLE);
  const latest = useRef({ state, data });
  latest.current.data = data;
  useEffect(() => {
    if (preview) return;
    const off = listen<KeyNavEvent>("keynav", (event) => {
      const next = navigate(latest.current.state, event, latest.current.data ?? []);
      latest.current.state = next.state;
      setState(next.state);
      run(next.effect);
    });
    return () => void off.then((stop) => stop());
  }, [preview]);
  return { focused: state.key };
}
