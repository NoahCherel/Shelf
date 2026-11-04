import { invoke } from "../../core/tauri";
import type { Provider } from "../../core/widget";

export interface SystemData {
  cpu: number;
  memory: number;
  battery: { percent: number; charging: boolean } | null;
}

interface RawStats {
  cpu: number;
  mem_used: number;
  mem_total: number;
  battery: { percent: number; charging: boolean } | null;
}

export function toSystem(raw: RawStats): SystemData {
  return {
    cpu: Math.round(raw.cpu),
    memory: raw.mem_total > 0 ? Math.round((raw.mem_used / raw.mem_total) * 100) : 0,
    battery: raw.battery,
  };
}

export const systemProvider: Provider<SystemData> = {
  id: "system",
  intervalMs: 2000,
  cache: false,
  fetch: async () => toSystem(await invoke<RawStats>("system_stats")),
};
