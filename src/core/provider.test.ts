import { afterEach, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Provider, ProviderError } from "./widget";

const invoke = vi.fn();
vi.mock("./tauri", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

// The runtime keeps module state, so every test gets a fresh copy.
async function fresh() {
  vi.resetModules();
  const [{ useProvider }, { setPaused }] = await Promise.all([import("./useProvider"), import("./provider")]);
  return { useProvider, setPaused };
}

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function counter(overrides: Partial<Provider<number>> = {}): Provider<number> & { fetch: ReturnType<typeof vi.fn> } {
  let n = 0;
  const fetch = vi.fn(async () => ++n);
  return { id: "demo", intervalMs: 300_000, fetch, ...overrides } as Provider<number> & { fetch: typeof fetch };
}

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset();
  invoke.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

it("two subscribers share one fetch", async () => {
  const { useProvider } = await fresh();
  const p = counter();
  renderHook(() => useProvider(p));
  renderHook(() => useProvider(p));
  await flush();
  expect(p.fetch).toHaveBeenCalledTimes(1);
});

it("no subscribers means no fetch", async () => {
  await fresh();
  const p = counter();
  await advance(600_000);
  expect(p.fetch).not.toHaveBeenCalled();
});

it("stops fetching when the last subscriber leaves", async () => {
  const { useProvider } = await fresh();
  const p = counter();
  const { unmount } = renderHook(() => useProvider(p));
  await flush();
  unmount();
  await advance(900_000);
  expect(p.fetch).toHaveBeenCalledTimes(1);
});

it("interval refetches", async () => {
  const { useProvider } = await fresh();
  const p = counter();
  const { result } = renderHook(() => useProvider(p));
  await flush();
  expect(result.current.data).toBe(1);
  expect(result.current.status).toBe("ready");
  await advance(300_000);
  expect(p.fetch).toHaveBeenCalledTimes(2);
  expect(result.current.data).toBe(2);
});

it("setPaused(true) stops fetches and resuming refreshes at once", async () => {
  const { useProvider, setPaused } = await fresh();
  const p = counter();
  renderHook(() => useProvider(p));
  await flush();
  act(() => setPaused(true));
  await advance(900_000);
  expect(p.fetch).toHaveBeenCalledTimes(1);
  act(() => setPaused(false));
  await flush();
  expect(p.fetch).toHaveBeenCalledTimes(2);
});

it("a failure keeps the last value as stale with the typed error", async () => {
  const { useProvider } = await fresh();
  const offline: ProviderError = { kind: "offline", message: "No connection" };
  const fetch = vi.fn<() => Promise<number>>().mockResolvedValueOnce(5).mockRejectedValueOnce(offline);
  const p: Provider<number> = { id: "demo", intervalMs: 300_000, fetch };
  const { result } = renderHook(() => useProvider(p));
  await flush();
  await advance(300_000);
  expect(result.current.data).toBe(5);
  expect(result.current.status).toBe("stale");
  expect(result.current.error).toEqual(offline);
});

it("a failure with nothing to show is an error", async () => {
  const { useProvider } = await fresh();
  const rejected: ProviderError = { kind: "rejected", message: "Key rejected" };
  const p: Provider<number> = { id: "demo", intervalMs: 300_000, fetch: vi.fn().mockRejectedValue(rejected) };
  const { result } = renderHook(() => useProvider(p));
  await flush();
  expect(result.current.data).toBeNull();
  expect(result.current.status).toBe("error");
  expect(result.current.error).toEqual(rejected);
});

it("an unexpected throw becomes an 'other' error", async () => {
  const { useProvider } = await fresh();
  const p: Provider<number> = { id: "demo", intervalMs: 300_000, fetch: vi.fn().mockRejectedValue(new Error("boom")) };
  const { result } = renderHook(() => useProvider(p));
  await flush();
  expect(result.current.error).toEqual({ kind: "other", message: "boom" });
});

it("failures back off to at least 60 seconds", async () => {
  const { useProvider } = await fresh();
  const p: Provider<number> = {
    id: "demo",
    intervalMs: 1_000,
    fetch: vi.fn().mockRejectedValue({ kind: "offline", message: "x" }),
  };
  renderHook(() => useProvider(p));
  await flush();
  await advance(59_000);
  expect(p.fetch).toHaveBeenCalledTimes(1);
  await advance(1_000);
  expect(p.fetch).toHaveBeenCalledTimes(2);
});

it("first paint uses the cached value before any fetch resolves", async () => {
  const { useProvider } = await fresh();
  invoke.mockImplementation(async (cmd: string, args: { name: string }) =>
    cmd === "store_load" && args.name === "cache-demo" ? { value: 41, at: 0 } : null,
  );
  let release: (n: number) => void = () => {};
  const p: Provider<number> = {
    id: "demo",
    intervalMs: 300_000,
    fetch: () => new Promise((resolve) => (release = resolve)),
  };
  vi.setSystemTime(1_000_000);
  const { result } = renderHook(() => useProvider(p));
  await flush();
  expect(result.current.data).toBe(41);
  act(() => release(42));
  await flush();
  expect(result.current.data).toBe(42);
});

it("a fresh cache means no fetch until the interval is up", async () => {
  const { useProvider } = await fresh();
  vi.setSystemTime(1_000_000);
  invoke.mockImplementation(async (cmd: string) => (cmd === "store_load" ? { value: 41, at: 1_000_000 - 100_000 } : null));
  const p = counter();
  const { result } = renderHook(() => useProvider(p));
  await flush();
  expect(result.current.status).toBe("ready");
  expect(p.fetch).not.toHaveBeenCalled();
  await advance(200_000);
  expect(p.fetch).toHaveBeenCalledTimes(1);
});

it("saves each new value to the cache with its time", async () => {
  const { useProvider } = await fresh();
  vi.setSystemTime(5_000);
  const p = counter();
  renderHook(() => useProvider(p));
  await flush();
  expect(invoke).toHaveBeenCalledWith("store_save", { name: "cache-demo", value: { value: 1, at: 5_000 } });
});

it("a provider can opt out of the cache", async () => {
  const { useProvider } = await fresh();
  const p = counter({ cache: false });
  renderHook(() => useProvider(p));
  await flush();
  expect(invoke).not.toHaveBeenCalled();
});

it("an unconfigured provider shows its sample and never fetches", async () => {
  const { useProvider } = await fresh();
  const p = counter({ needsSetup: async () => true });
  const { result } = renderHook(() => useProvider(p, 99));
  await flush();
  await advance(900_000);
  expect(result.current.data).toBe(99);
  expect(result.current.status).toBe("sample");
  expect(p.fetch).not.toHaveBeenCalled();
});

it("connecting then refreshing leaves the sample behind", async () => {
  const { useProvider } = await fresh();
  let connected = false;
  const p = counter({ needsSetup: async () => !connected });
  const { result } = renderHook(() => useProvider(p, 99));
  await flush();
  connected = true;
  act(() => result.current.refresh());
  await flush();
  expect(result.current.data).toBe(1);
  expect(result.current.status).toBe("ready");
});

it("refresh is not run again while one is in flight", async () => {
  const { useProvider } = await fresh();
  const fetch = vi.fn(() => new Promise<number>(() => {}));
  const p: Provider<number> = { id: "demo", intervalMs: 300_000, fetch };
  const { result } = renderHook(() => useProvider(p));
  await flush();
  act(() => result.current.refresh());
  act(() => result.current.refresh());
  await flush();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("no provider just shows the sample", async () => {
  const { useProvider } = await fresh();
  const { result } = renderHook(() => useProvider(undefined, 7));
  expect(result.current.data).toBe(7);
  expect(result.current.status).toBe("sample");
});

it("doesn't redraw when a new value equals the last one", async () => {
  const { useProvider } = await fresh();
  const p: Provider<{ a: number }> = { id: "demo", intervalMs: 1_000, cache: false, fetch: async () => ({ a: 1 }) };
  const { result } = renderHook(() => useProvider(p));
  await flush();
  const first = result.current.data;
  await advance(1_000);
  expect(result.current.data).toBe(first);
});
