import { invoke } from "../../core/tauri";
import type { Provider } from "../../core/widget";

export interface StatusData {
  wifi: { ssid: string; signal: number } | null;
  online: boolean;
  volume: { percent: number; muted: boolean } | null;
  battery: { percent: number; charging: boolean } | null;
}

/** Windows' own steps: one bar whenever connected, four when strong. */
export function signalBars(signal: number): number {
  if (signal >= 75) return 4;
  if (signal >= 50) return 3;
  if (signal >= 25) return 2;
  return 1;
}

export const statusProvider: Provider<StatusData> = {
  id: "status",
  intervalMs: 3000,
  cache: false,
  fetch: () => invoke<StatusData>("system_status"),
};
