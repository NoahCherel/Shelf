import { beforeEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { invoke, listen } from "../core/tauri";
import { useProvider } from "../core/useProvider";
import { windowLabel } from "../core/windowLabel";
import { defaults, useSettings } from "../core/settings";
import { useLayout } from "../core/layout";
import { useAutomations } from "./useAutomations";

vi.mock("../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));
vi.mock("../core/windowLabel", () => ({ windowLabel: vi.fn(() => "dock") }));
vi.mock("../core/useProvider", () => ({ useProvider: vi.fn() }));

const RESET = Date.now() + 85 * 60_000;
const reading = (percent: number, status = "ready") => ({
  data: { session: { percent, resetsAt: RESET }, weekly: null, updatedMs: 0 },
  status,
  refresh: () => {},
});

function Host() {
  useAutomations();
  return null;
}

const toasts = () => vi.mocked(invoke).mock.calls.filter(([c]) => c === "toast_show").map(([, a]) => (a as { toast: { title: string } }).toast);

/** What the store holds under "automations", kept across mounts as on disk. */
let store: unknown = null;

async function mount(stored?: unknown) {
  if (stored !== undefined) store = stored;
  vi.mocked(invoke).mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    if (args?.name !== "automations") return null as never;
    if (command === "store_load") return store as never;
    if (command === "store_save") store = args.value;
    return null as never;
  });
  const view = render(<Host />);
  await act(async () => {});
  return view;
}

beforeEach(() => {
  store = null;
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockClear();
  vi.mocked(windowLabel).mockReturnValue("dock");
  vi.mocked(useProvider).mockReturnValue(reading(85) as never);
  useSettings.setState({ ...defaults() });
  useLayout.setState({ ids: ["claude-usage", "apps"] });
});

/** Rust says a toast reached the screen. */
async function shown(id: string) {
  const handler = vi.mocked(listen).mock.calls.filter(([event]) => event === "toast-shown").at(-1)?.[1];
  await act(async () => handler?.(id as never));
}

const saved = () => vi.mocked(invoke).mock.calls.filter(([c, a]) => c === "store_save" && (a as { name: string }).name === "automations");

it("warns once the reading crosses a step, with a way to the card", async () => {
  await mount();
  expect(toasts()).toHaveLength(1);
  expect(toasts()[0]).toMatchObject({ title: "Claude session at 85%", action: { target: "widget:claude-usage" } });
});

it("counts a warning as given only once it has shown", async () => {
  await mount();
  expect(saved()).toEqual([]);
  await shown("ai-limit-session");
  expect(invoke).toHaveBeenCalledWith("store_save", { name: "automations", value: { session: { resetsAt: RESET, step: 80 } } });
});

it("a warning still waiting when Shelf stops comes back after a restart", async () => {
  const first = await mount();
  expect(toasts()).toHaveLength(1);
  first.unmount();
  vi.mocked(invoke).mockClear();
  await mount();
  expect(toasts()).toHaveLength(1);
});

it("a warning waiting to show isn't sent again with each reading", async () => {
  const view = await mount();
  vi.mocked(useProvider).mockReturnValue(reading(86) as never);
  view.rerender(<Host />);
  await act(async () => {});
  expect(toasts()).toHaveLength(1);
});

it("remembers warnings across restarts", async () => {
  await mount({ session: { resetsAt: RESET, step: 80 } });
  expect(toasts()).toEqual([]);
});

it("does nothing with the automation off or sample data", async () => {
  useSettings.setState({ automations: { aiLimits: false } });
  await mount();
  expect(toasts()).toEqual([]);
  expect(vi.mocked(useProvider).mock.calls.every(([p]) => p === undefined)).toBe(true);
  useSettings.setState({ automations: { aiLimits: true } });
  vi.mocked(useProvider).mockReturnValue(reading(99, "sample") as never);
  await mount();
  expect(toasts()).toEqual([]);
});

it("only the main dock runs automations", async () => {
  vi.mocked(windowLabel).mockReturnValue("dock-2");
  await mount();
  expect(toasts()).toEqual([]);
});

it("falls back to the plan widget's card, then to no button", async () => {
  useLayout.setState({ ids: ["claude-plan-usage"] });
  await mount();
  expect(toasts()[0]).toMatchObject({ action: { target: "widget:claude-plan-usage" } });
  vi.mocked(invoke).mockClear();
  useLayout.setState({ ids: ["apps"] });
  await mount();
  expect((toasts()[0] as { action?: unknown }).action).toBeUndefined();
});
