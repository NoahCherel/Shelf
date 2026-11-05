import { invoke } from "../../core/tauri";
import { useSettings } from "../../core/settings";

/** A value kept outside the settings file, like Windows' own startup list. */
export interface External<V> {
  read: () => Promise<V>;
  write: (value: V) => Promise<unknown>;
}

interface Common {
  /** Dotted path into settings, like "weather.city". */
  key: string;
  label: string;
  tip: string;
  /** Runs after the setting changes. */
  onChange?: (value: never) => void;
}

export type RowDef =
  | (Common & { kind: "toggle"; external?: External<boolean> })
  | (Common & { kind: "slider"; min: number; max: number; marks: Record<string, number> })
  | (Common & { kind: "choice"; options: { value: string; label: string }[] })
  | (Common & { kind: "text"; placeholder?: string })
  | (Common & { kind: "accent" })
  | (Common & { kind: "action"; run: () => void; danger?: boolean })
  | (Common & { kind: "version" });

export interface SectionDef {
  title?: string;
  rows: RowDef[];
}

export interface PageDef {
  id: string;
  title: string;
  groups: SectionDef[];
}

type Options<T> = Omit<T, "key" | "kind">;

export const section = (title: string | undefined, rows: RowDef[]): SectionDef => ({ title, rows });
export const toggle = (key: string, o: Options<Extract<RowDef, { kind: "toggle" }>>): RowDef => ({ kind: "toggle", key, ...o });
export const slider = (key: string, o: Options<Extract<RowDef, { kind: "slider" }>>): RowDef => ({ kind: "slider", key, ...o });
export const choice = (key: string, o: Options<Extract<RowDef, { kind: "choice" }>>): RowDef => ({ kind: "choice", key, ...o });
export const text = (key: string, o: Options<Extract<RowDef, { kind: "text" }>>): RowDef => ({ kind: "text", key, ...o });

/** The Apple system palette (G-09). */
export const ACCENTS = [
  { name: "Blue", color: "#0a84ff" },
  { name: "Purple", color: "#bf5af2" },
  { name: "Pink", color: "#ff375f" },
  { name: "Red", color: "#ff453a" },
  { name: "Orange", color: "#ff9f0a" },
  { name: "Yellow", color: "#ffd60a" },
  { name: "Green", color: "#30d158" },
  { name: "Teal", color: "#64d2ff" },
  { name: "Graphite", color: "#8e8e93" },
];

export const SCHEMA: PageDef[] = [
  {
    id: "appearance",
    title: "Appearance",
    groups: [
      section("Dock style", [
        choice("style", {
          label: "Style",
          tip: "Liquid Glass bends what's behind the dock. Black is solid and uses the least power.",
          options: [
            { value: "liquid", label: "Liquid Glass" },
            { value: "black", label: "Black" },
          ],
        }),
        choice("theme", {
          label: "Theme",
          tip: "Auto follows Windows' light or dark mode.",
          options: [
            { value: "auto", label: "Auto" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ],
        }),
        { kind: "accent", key: "accent", label: "Accent", tip: "Used for switches, rings, the open-app dots and highlights." },
      ]),
    ],
  },
  {
    id: "dock",
    title: "Dock",
    groups: [
      section(undefined, [
        slider("size", {
          label: "Size",
          tip: "How tall the dock's tiles are. Everything scales with it.",
          min: 40,
          max: 62,
          marks: { S: 40, M: 50, L: 62 },
        }),
      ]),
      section("Position", [
        toggle("floatOverWindows", {
          label: "Float over windows",
          tip: "The dock sits on top of your apps, and they use the whole screen. Off, maximized windows stop above it.",
        }),
        slider("edgeGap", {
          label: "Distance from edge",
          tip: "The space between the dock and the bottom of the screen.",
          min: 0,
          max: 24,
          marks: {},
        }),
      ]),
      section("Clock", [
        toggle("hour24", { label: "24-hour time", tip: "Shows 17:30 rather than 5:30 PM on every clock." }),
        toggle("seconds", { label: "Seconds", tip: "Shows seconds on the Clock widget." }),
      ]),
      section("Arranging", [
        toggle("lockDock", { label: "Lock dock", tip: "Widgets can then only be moved while the widget picker is open." }),
      ]),
    ],
  },
  {
    id: "general",
    title: "General",
    groups: [
      section("Windows", [
        choice("taskbarMode", {
          label: "Windows taskbar",
          tip: "Hidden removes it entirely. Auto-hide lets it slide up from the bottom edge.",
          options: [
            { value: "hidden", label: "Hidden" },
            { value: "autohide", label: "Auto-hide" },
          ],
          onChange: (mode: never) => void invoke("set_taskbar_mode", { mode }).catch(() => {}),
        }),
        toggle("launchAtStartup", {
          label: "Launch at startup",
          tip: "Starts Shelf when you sign in to Windows. This reads Windows' own list, so it stays right if you change it there.",
          external: {
            read: () => invoke<boolean>("autostart_get"),
            write: (on) => invoke("autostart_set", { on }),
          },
        }),
      ]),
      section("Weather", [
        text("weather.city", { label: "Weather city", tip: "Used by Clock & Weather, Today and the date card.", placeholder: "Add a city" }),
      ]),
      section(undefined, [
        {
          kind: "action",
          key: "quit",
          label: "Quit Shelf",
          tip: "Closes the dock and puts your Windows taskbar back as it was.",
          danger: true,
          run: () => void invoke("quit").catch(() => {}),
        },
      ]),
    ],
  },
  {
    id: "about",
    title: "About",
    groups: [
      section(undefined, [{ kind: "version", key: "version", label: "Version", tip: "A private build, rebuilt from source." }]),
    ],
  },
];

export function readPath(key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], useSettings.getState());
}

export function writePath(key: string, value: unknown): void {
  const [head, leaf] = key.split(".");
  const state = useSettings.getState() as unknown as Record<string, Record<string, unknown>>;
  useSettings.getState().update(leaf ? { [head]: { ...state[head], [leaf]: value } } : { [head]: value });
}
