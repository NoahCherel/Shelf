import { emit } from "../../core/tauri";

/** Every scene happens at this moment: a Thursday afternoon. Set once in the page by `freezeClock`. */
export const BENCH_NOW = new Date(2026, 10, 5, 15, 42, 7).getTime();

type Handlers = Record<string, (args: any) => unknown>;

const icon = (letter: string, color: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="${color}"/><text x="48" y="66" font-family="Arial" font-size="52" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`,
  )}`;

const COLORS = ["#2d7ff9", "#ef6c33", "#22a06b", "#8f5bd6", "#d1417a", "#c99a1a"];

export interface FakeApp {
  key: string;
  name: string;
  pinned: boolean;
  active: boolean;
  windows: { hwnd: number; title: string }[];
}

export function fakeApps(count: number, activeIndex = -1): FakeApp[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `app-${i}`,
    name: `App ${i}`,
    pinned: i % 3 !== 2,
    active: i === activeIndex,
    windows: i % 2 === 0 ? [{ hwnd: i + 1, title: `Window ${i}` }] : [],
  }));
}

/** What Rust would hand over: the wallpaper under the bar, as BGRA rows after a size header. */
function glassFrame(): ArrayBuffer | null {
  const scene = document.querySelector<HTMLCanvasElement>(".bench__scene");
  const bar = document.querySelector(".dock");
  if (!scene || !bar) return null;
  const scale = window.devicePixelRatio || 1;
  const r = bar.getBoundingClientRect();
  const [x, y, w, h] = [r.left, r.top, r.width, r.height].map((v) => Math.round(v * scale));
  const rgba = scene.getContext("2d")!.getImageData(x, y, w, h).data;
  const out = new Uint8Array(8 + rgba.length);
  const head = new DataView(out.buffer);
  head.setUint32(0, w, true);
  head.setUint32(4, h, true);
  for (let i = 0; i < rgba.length; i += 4) {
    out[8 + i] = rgba[i + 2];
    out[9 + i] = rgba[i + 1];
    out[10 + i] = rgba[i];
    out[11 + i] = 255;
  }
  return out.buffer;
}

const frameSoon = () => {
  setTimeout(() => void emit("glass-frame"), 60);
};

/** Commands every scene can answer. A scene's own `backend` overrides any of them. */
export function baseBackend(settings: Record<string, unknown>, layout: string[]): Handlers {
  const inSeconds = (s: number) => BENCH_NOW / 1000 + s;
  return {
    store_load: ({ name }: { name: string }) => {
      if (name === "settings") return settings;
      if (name === "layout") return { version: 2, ids: layout };
      return null;
    },
    store_save: () => null,
    shell_status: () => ({ fullscreen: false, locked: false, hidden_taskbar: true }),
    set_dock_width: () => frameSoon(),
    glass_start: () => frameSoon(),
    glass_stop: () => null,
    glass_frame: () => glassFrame(),
    open_card: () => null,
    fit_card: () => null,
    card_current: () => null,
    close_card: () => null,
    open_window: () => null,
    close_window: () => null,
    apps_list: () => fakeApps(5, 2),
    apps_icon: ({ key }: { key: string }) => {
      const n = Number(key.replace(/\D/g, "")) || 0;
      return icon(String.fromCharCode(65 + (n % 26)), COLORS[n % COLORS.length]);
    },
    system_stats: () => ({ cpu: 21, mem_used: 74, mem_total: 100, battery: { percent: 64, charging: false } }),
    system_status: () => ({
      wifi: { ssid: "Livebox", signal: 80 },
      online: true,
      volume: { percent: 40, muted: false },
      battery: { percent: 64, charging: false },
    }),
    claude_usage: () => ({
      connected: true,
      usage: {
        five_hour: { used_percentage: 41, resets_at: inSeconds(85 * 60) },
        seven_day: { used_percentage: 72, resets_at: inSeconds(3 * 86_400) },
      },
    }),
    secret_has: () => false,
    autostart_get: () => false,
  };
}

export const baseSettings: Record<string, unknown> = {
  version: 1,
  style: "liquid",
  size: 50,
  hour24: true,
  seconds: true,
  floatOverWindows: true,
  edgeGap: 6,
};
