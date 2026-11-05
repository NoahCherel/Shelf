import { invoke } from "../../core/tauri";
import type { Provider } from "../../core/widget";

export interface RadioInfo {
  kind: "wifi" | "bluetooth";
  on: boolean;
}

export interface QuickState {
  radios: RadioInfo[];
  brightness: number | null;
}

export const quickProvider: Provider<QuickState> = {
  id: "quick",
  intervalMs: 2000,
  cache: false,
  fetch: async () => {
    const [radios, brightness] = await Promise.all([invoke<RadioInfo[]>("radios_state"), invoke<number | null>("brightness_get")]);
    return { radios, brightness };
  },
};
