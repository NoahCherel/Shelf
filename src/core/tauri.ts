// The only file that imports @tauri-apps/api, so tests can replace it whole.
import { invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

export function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) return Promise.reject(new Error(`not running in Shelf: ${command}`));
  return tauriInvoke<T>(command, args);
}

export function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (!isTauri()) return Promise.resolve(() => {});
  return tauriListen<T>(event, (e) => handler(e.payload));
}
