import { invoke } from "../core/tauri";
import type { Provider } from "../core/widget";

interface AudioDevice {
  id: string;
  name: string;
  active: boolean;
}

export interface AudioApp {
  pid: number;
  name: string;
  exe: string;
  volume: number;
  muted: boolean;
}

export interface AudioState {
  volume: number;
  muted: boolean;
  device: string | null;
  devices: AudioDevice[];
  apps: AudioApp[];
}

export const audioProvider: Provider<AudioState> = {
  id: "audio",
  intervalMs: 2000,
  cache: false,
  fetch: () => invoke<AudioState>("audio_state"),
};
