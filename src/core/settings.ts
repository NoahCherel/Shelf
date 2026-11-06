import { create } from "zustand";
import { invoke, listen } from "./tauri";

const VERSION = 1;

export interface SettingsData {
  style: "liquid" | "black";
  theme: "auto" | "dark" | "light";
  accent: string | null;
  size: number;
  hour24: boolean;
  seconds: boolean;
  taskbarMode: "hidden" | "autohide";
  lockDock: boolean;
  /** Over other windows, reserving nothing. Otherwise maximized windows stop above the dock. */
  floatOverWindows: boolean;
  /** Logical px between the dock and its edge of the screen. */
  edgeGap: number;
  edge: "bottom" | "top";
  /** A pill as wide as its contents, or the whole edge like the taskbar. */
  dockWidth: "pill" | "full";
  /** The space between widgets, in hundredths of a tile's height. */
  spacing: number;
  /** Slides away when not in use, and back when the pointer touches its edge. */
  autoHide: boolean;
  /** With auto-hide: stays up while the desktop is in front. */
  showOnDesktop: boolean;
  weather: { city: string };
  github: { user: string };
}

export const SIZE_MIN = 40;
export const SIZE_MAX = 62;
export const GAP_MAX = 24;
export const SPACING_MAX = 24;

export function defaults(): SettingsData {
  return {
    style: "liquid",
    theme: "auto",
    accent: null,
    size: 50,
    hour24: Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 === false,
    seconds: true,
    taskbarMode: "hidden",
    lockDock: false,
    floatOverWindows: true,
    edgeGap: 6,
    edge: "bottom",
    dockWidth: "pill",
    spacing: 4,
    autoHide: false,
    showOnDesktop: false,
    weather: { city: "" },
    github: { user: "" },
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T,>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const text = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);

/** Each key falls back on its own, so one bad value can't cost the others. */
export function sanitize(raw: unknown): SettingsData {
  const d = defaults();
  if (!isObject(raw)) return d;
  const weather = isObject(raw.weather) ? raw.weather : {};
  const github = isObject(raw.github) ? raw.github : {};
  return {
    style: oneOf(raw.style, ["liquid", "black"] as const, d.style),
    theme: oneOf(raw.theme, ["auto", "dark", "light"] as const, d.theme),
    accent: typeof raw.accent === "string" && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : null,
    size: typeof raw.size === "number" && Number.isFinite(raw.size) ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, raw.size)) : d.size,
    hour24: bool(raw.hour24, d.hour24),
    seconds: bool(raw.seconds, d.seconds),
    taskbarMode: oneOf(raw.taskbarMode, ["hidden", "autohide"] as const, d.taskbarMode),
    lockDock: bool(raw.lockDock, d.lockDock),
    floatOverWindows: bool(raw.floatOverWindows, d.floatOverWindows),
    edgeGap: typeof raw.edgeGap === "number" && Number.isFinite(raw.edgeGap) ? Math.min(GAP_MAX, Math.max(0, raw.edgeGap)) : d.edgeGap,
    edge: oneOf(raw.edge, ["bottom", "top"] as const, d.edge),
    dockWidth: oneOf(raw.dockWidth, ["pill", "full"] as const, d.dockWidth),
    spacing: typeof raw.spacing === "number" && Number.isFinite(raw.spacing) ? Math.min(SPACING_MAX, Math.max(0, raw.spacing)) : d.spacing,
    autoHide: bool(raw.autoHide, d.autoHide),
    showOnDesktop: bool(raw.showOnDesktop, d.showOnDesktop),
    weather: { city: text(weather.city, d.weather.city) },
    github: { user: text(github.user, d.github.user) },
  };
}

interface Settings extends SettingsData {
  update(patch: Partial<SettingsData>): void;
  load(): Promise<void>;
}

function dataOf(s: Settings): SettingsData {
  const { update: _update, load: _load, ...data } = s;
  return data;
}

export const useSettings = create<Settings>((set, get) => ({
  ...defaults(),
  update(patch) {
    set(patch);
    invoke("store_save", { name: "settings", value: { version: VERSION, ...dataOf(get()) } }).catch(() => {});
  },
  async load() {
    const saved = await invoke("store_load", { name: "settings" }).catch(() => null);
    set(sanitize(saved));
  },
}));

/** Loads settings and follows changes made in other windows. */
export async function syncSettings(): Promise<void> {
  await useSettings.getState().load();
  listen<string>("store-changed", (name) => {
    if (name === "settings") useSettings.getState().load();
  });
}
