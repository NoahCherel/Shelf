import { setAccent, setDockSize, setStyle, setTheme } from "../design/theme";
import { useSettings, type SettingsData } from "./settings";

const prefersDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;

function apply(s: SettingsData, fixedT?: number) {
  setStyle(s.style);
  setTheme(s.theme === "auto" ? (prefersDark() ? "dark" : "light") : s.theme);
  setAccent(s.accent);
  setDockSize(fixedT ?? s.size);
}

/** Keeps this window's design tokens in line with the settings. */
export function followLook(fixedT?: number): void {
  apply(useSettings.getState(), fixedT);
  useSettings.subscribe((s) => apply(s, fixedT));
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => apply(useSettings.getState(), fixedT));
}
