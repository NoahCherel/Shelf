import { installFakeBackend } from "../../core/tauri";
import { BENCH_NOW, baseBackend, baseSettings } from "./fixtures";
import { scenes } from "./scenes";

/** Stops the clock, so times and countdowns draw the same every run. Returns how to restart it. */
export function freezeClock(now: number): () => void {
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(now);
      else super(...(args as [number]));
    }
    static now() {
      return now;
    }
  }
  globalThis.Date = FrozenDate as DateConstructor;
  return () => {
    globalThis.Date = RealDate;
  };
}

/** Runs before anything else in the page, as widgets read the clock when they load. */
export function prepareBench(): void {
  const id = new URLSearchParams(location.search).get("scene");
  const scene = scenes.find((s) => s.id === id);
  document.documentElement.dataset.bench = "true";
  if (id === "__list") (window as { __benchScenes?: unknown }).__benchScenes = scenes.map(({ backend: _backend, ...rest }) => rest);
  freezeClock(BENCH_NOW);
  const settings = { ...baseSettings, theme: scene?.theme ?? "dark", ...scene?.settings };
  installFakeBackend({ ...baseBackend(settings, scene?.dock ?? [], scene?.positions), ...scene?.backend });
  window.addEventListener("error", (e) => {
    (window as { __benchError?: string }).__benchError = e.message;
  });
}
