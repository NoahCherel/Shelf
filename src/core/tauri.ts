// The only file that imports @tauri-apps/api, so tests can replace it whole.
import { getVersion } from "@tauri-apps/api/app";
import { invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";
import { emit as tauriEmit, listen as tauriListen } from "@tauri-apps/api/event";

export function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) return Promise.reject(new Error(`not running in Shelf: ${command}`));
  return tauriInvoke<T>(command, args);
}

export function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (!isTauri()) return Promise.resolve(() => {});
  return tauriListen<T>(event, (e) => handler(e.payload));
}

export function emit(event: string, payload?: unknown): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return tauriEmit(event, payload);
}

export function appVersion(): Promise<string> {
  return isTauri() ? getVersion() : Promise.resolve("");
}
