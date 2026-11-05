// The only file that imports @tauri-apps/api, so tests can replace it whole.
import { getVersion } from "@tauri-apps/api/app";
import { invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";
import { emit as tauriEmit, listen as tauriListen } from "@tauri-apps/api/event";

type Handlers = Record<string, (args: any) => unknown>;

// The visual bench runs the real UI in a plain browser, answering commands from fixtures.
let fake: Handlers | null = null;
const fakeListeners = new Map<string, Set<(payload: any) => void>>();

export function installFakeBackend(handlers: Handlers | null): void {
  fake = handlers;
  fakeListeners.clear();
}

export function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (fake) {
    const handler = fake[command];
    if (!handler) return Promise.reject(new Error(`fake backend has no ${command}`));
    try {
      return Promise.resolve(handler(args) as T);
    } catch (e) {
      return Promise.reject(e);
    }
  }
  if (!isTauri()) return Promise.reject(new Error(`not running in Shelf: ${command}`));
  return tauriInvoke<T>(command, args);
}

export function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (fake) {
    const listeners = fakeListeners.get(event) ?? new Set();
    fakeListeners.set(event, listeners);
    listeners.add(handler);
    return Promise.resolve(() => listeners.delete(handler));
  }
  if (!isTauri()) return Promise.resolve(() => {});
  return tauriListen<T>(event, (e) => handler(e.payload));
}

export function emit(event: string, payload?: unknown): Promise<void> {
  if (fake) {
    fakeListeners.get(event)?.forEach((listener) => listener(payload));
    return Promise.resolve();
  }
  if (!isTauri()) return Promise.resolve();
  return tauriEmit(event, payload);
}

export function appVersion(): Promise<string> {
  return isTauri() ? getVersion() : Promise.resolve("");
}
