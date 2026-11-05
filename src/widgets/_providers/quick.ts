import { invoke } from "../../core/tauri";
import type { Provider } from "../../core/widget";

export interface RadioInfo {
  kind: "wifi" | "bluetooth";
  on: boolean;
}

export type ToggleKind = "airplane" | "dnd" | "night_light" | "energy_saver";

export interface QuickState {
  radios: RadioInfo[];
  brightness: number | null;
  /** Null when Windows won't say, and the card links to Settings instead. */
  toggles: Record<ToggleKind, boolean | null>;
}

export const quickProvider: Provider<QuickState> = {
  id: "quick",
  intervalMs: 2000,
  cache: false,
  fetch: async () => {
    const [radios, brightness, toggles] = await Promise.all([
      invoke<RadioInfo[]>("radios_state"),
      invoke<number | null>("brightness_get"),
      invoke<QuickState["toggles"]>("toggles_state"),
    ]);
    return { radios, brightness, toggles };
  },
};
