import { invoke } from "../../core/tauri";
import type { Provider } from "../../core/widget";

export interface AudioDevice {
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

const WRITE_EVERY_MS = 40;

/** Sends the first value at once, then at most one every 40 ms, always ending on the last. */
export function coalesced<T>(send: (value: T) => void): (value: T) => void {
  let waiting: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = () => {
    timer = null;
    if (waiting) {
      send(waiting.value);
      waiting = null;
      timer = setTimeout(tick, WRITE_EVERY_MS);
    }
  };
  return (value) => {
    if (timer) {
      waiting = { value };
      return;
    }
    send(value);
    timer = setTimeout(tick, WRITE_EVERY_MS);
  };
}
