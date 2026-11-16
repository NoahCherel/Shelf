import { setAccent, setClearMaterial, setDockSize, setEdge, setSpacing, setStyle, setTheme } from "../design/theme";
import { useSettings, type SettingsData } from "./settings";
import { invoke, listen } from "./tauri";

/** The colour to use: the album's when following it, none (the default) when there isn't one. */
export function resolveAccent(accent: string | null, album: string | null): string | null {
  return accent === "album" ? album : accent;
}

/** The colour of the cover playing now, as Rust last announced it. */
let album: string | null = null;

const prefersDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;

function apply(s: SettingsData, fixedT?: number) {
  setStyle(s.style);
  setClearMaterial(s.clearMaterial);
  setTheme(s.theme === "auto" ? (prefersDark() ? "dark" : "light") : s.theme);
  setAccent(resolveAccent(s.accent, album));
  setDockSize(fixedT ?? s.size);
  setEdge(s.edge);
  setSpacing(s.spacing);
}

/** Keeps this window's design tokens in line with the settings. */
export function followLook(fixedT?: number): void {
  apply(useSettings.getState(), fixedT);
  useSettings.subscribe((s) => apply(s, fixedT));
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => apply(useSettings.getState(), fixedT));
  const follow = (colour: string | null) => {
    album = colour;
    apply(useSettings.getState(), fixedT);
  };
  invoke<string | null>("album_accent_current").then(follow, () => {});
  listen<string | null>("album-accent", follow);
}
