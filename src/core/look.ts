import { setAccent, setDockSize, setStyle, setTheme } from "../design/theme";
import { useSettings, type SettingsData } from "./settings";

const prefersDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;

function apply(s: SettingsData) {
  setStyle(s.style);
  setTheme(s.theme === "auto" ? (prefersDark() ? "dark" : "light") : s.theme);
  setAccent(s.accent);
  setDockSize(s.size);
}

/** Keeps this window's design tokens in line with the settings. */
export function followLook(): void {
  apply(useSettings.getState());
  useSettings.subscribe(apply);
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => apply(useSettings.getState()));
}
