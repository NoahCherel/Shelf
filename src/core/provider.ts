import { emit, invoke, listen } from "./tauri";
import type { Provider, ProviderError, Status } from "./widget";

export type { Provider, ProviderError, Status } from "./widget";

const MIN_RETRY_MS = 60_000;

export interface Snapshot<D> {
  data: D | null;
  status: Status;
  error?: ProviderError;
}

interface Cached<D> {
  value: D;
  at: number;
}

interface Entry<D> {
  provider: Provider<D>;
  sample: D | undefined;
  state: Snapshot<D>;
  listeners: Set<() => void>;
  timer?: ReturnType<typeof setTimeout>;
  inFlight: boolean;
  lastAt: number;
}

const entries = new Map<string, Entry<any>>();
let paused = false;

function entryFor<D>(provider: Provider<D>, sample?: D): Entry<D> {
  let entry = entries.get(provider.id) as Entry<D> | undefined;
  if (!entry) {
    entry = {
      provider,
      sample,
      state: { data: sample ?? null, status: "loading" },
      listeners: new Set(),
      inFlight: false,
      lastAt: 0,
    };
    entries.set(provider.id, entry);
  }
  return entry;
}

function publish<D>(entry: Entry<D>, state: Snapshot<D>) {
  entry.state = state;
  entry.listeners.forEach((listener) => listener());
}

function schedule<D>(entry: Entry<D>, delay: number) {
  clearTimeout(entry.timer);
  if (paused || entry.listeners.size === 0) return;
  entry.timer = setTimeout(() => run(entry), delay);
}

function asError(e: unknown): ProviderError {
  if (e && typeof e === "object" && "kind" in e && "message" in e) return e as ProviderError;
  return { kind: "other", message: e instanceof Error ? e.message : String(e) };
}

async function run<D>(entry: Entry<D>) {
  if (entry.inFlight || paused) return;
  entry.inFlight = true;
  const { provider } = entry;
  try {
    if (await provider.needsSetup?.()) {
      publish(entry, { data: entry.sample ?? null, status: "sample" });
      return; // Connecting calls refresh, so there is nothing to poll for.
    }
    const known = entry.state.status === "sample" ? null : entry.state.data;
    const value = await provider.fetch(known);
    entry.lastAt = Date.now();
    publish(entry, { data: value, status: "ready" });
    if (provider.cache !== false) {
      const cached: Cached<D> = { value, at: entry.lastAt };
      invoke("store_save", { name: `cache-${provider.id}`, value: cached }).catch(() => {});
    }
    schedule(entry, provider.intervalMs);
  } catch (e) {
    const error = asError(e);
    const known = entry.state.status === "sample" ? null : entry.state.data;
    publish(entry, known === null ? { data: null, status: "error", error } : { data: known, status: "stale", error });
    schedule(entry, Math.max(provider.intervalMs, MIN_RETRY_MS));
  } finally {
    entry.inFlight = false;
  }
}

async function start<D>(entry: Entry<D>) {
  const { provider } = entry;
  if (provider.cache === false || entry.lastAt > 0) return run(entry);
  const cached = (await invoke("store_load", { name: `cache-${provider.id}` }).catch(() => null)) as Cached<D> | null;
  if (cached && "value" in cached) {
    const setup = await provider.needsSetup?.();
    if (setup) return run(entry);
    const age = Date.now() - (cached.at ?? 0);
    entry.lastAt = cached.at ?? 0;
    if (age < provider.intervalMs) {
      publish(entry, { data: cached.value, status: "ready" });
      schedule(entry, provider.intervalMs - age);
      return;
    }
    publish(entry, { data: cached.value, status: "loading" });
  }
  return run(entry);
}

export function subscribe<D>(provider: Provider<D>, sample: D | undefined, listener: () => void): () => void {
  const entry = entryFor(provider, sample);
  entry.listeners.add(listener);
  if (entry.listeners.size === 1) void start(entry);
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) clearTimeout(entry.timer);
  };
}

export function snapshot<D>(provider: Provider<D>, sample?: D): Snapshot<D> {
  return entryFor(provider, sample).state;
}

/** Runs a provider now, here and in every other window. */
export function refresh<D>(provider: Provider<D>): void {
  void run(entryFor(provider));
  emit("provider-refresh", provider.id).catch(() => {});
}

export function setPaused(next: boolean): void {
  if (next === paused) return;
  paused = next;
  for (const entry of entries.values()) {
    clearTimeout(entry.timer);
    if (!paused && entry.listeners.size > 0) void run(entry);
  }
}

// Windows have separate copies of this runtime: a key connected in the card window
// must reach the dock, and the dock's new values must reach an open card.
listen<string>("provider-refresh", (id) => {
  const entry = entries.get(id);
  if (entry && entry.listeners.size > 0) void run(entry);
});

listen<string>("store-changed", async (name) => {
  if (!name.startsWith("cache-")) return;
  const entry = entries.get(name.slice("cache-".length));
  if (!entry || entry.listeners.size === 0) return;
  const cached = (await invoke("store_load", { name }).catch(() => null)) as Cached<unknown> | null;
  if (cached && cached.at > entry.lastAt) {
    entry.lastAt = cached.at;
    publish(entry, { data: cached.value, status: "ready" });
    schedule(entry, entry.provider.intervalMs);
  }
});
