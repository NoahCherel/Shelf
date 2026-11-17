import { beforeEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { invoke, listen } from "../../core/tauri";
import { windowLabel } from "../../core/windowLabel";
import { useOpenRequests } from "./useOpenRequests";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(async () => null),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

vi.mock("../../core/windowLabel", () => ({ windowLabel: vi.fn(() => "dock") }));

vi.mock("../../core/byId", () => ({
  byId: (id: string) => (id === "clock" ? { id: "clock", name: "Clock", Card: () => null, cardWidth: 300, cardHeight: 200 } : undefined),
}));

function Host({ quickButton }: { quickButton?: boolean }) {
  useOpenRequests();
  return (
    <div className="dock">
      {quickButton && <button data-panel="quick">quick</button>}
      <div data-widget-id="clock">clock</div>
    </div>
  );
}

/** Mounts the hook and returns what it does with one open-request. */
async function request(target: string, quickButton = false) {
  render(<Host quickButton={quickButton} />);
  await act(async () => {});
  const handler = vi.mocked(listen).mock.calls.find(([event]) => event === "open-request")?.[1];
  await act(async () => handler?.({ target } as never));
  return vi.mocked(invoke).mock.calls.filter(([c]) => c === "open_card");
}

beforeEach(() => {
  vi.mocked(invoke).mockClear();
  vi.mocked(listen).mockClear();
  vi.mocked(windowLabel).mockReturnValue("dock");
});

it("opens a panel over its own button", async () => {
  const calls = await request("panel:quick", true);
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toMatchObject({ widgetId: "__panel:quick", width: 340 });
});

it("opens a panel over the dock when its button is missing", async () => {
  const calls = await request("panel:notifications");
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toMatchObject({ widgetId: "__panel:notifications" });
});

it("opens a widget's card like a click", async () => {
  const calls = await request("widget:clock");
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toMatchObject({ widgetId: "clock", width: 300, height: 200 });
});

it("ignores a widget that is not on the dock", async () => {
  expect(await request("widget:stripe")).toHaveLength(0);
});

it("ignores what it doesn't know", async () => {
  expect(await request("panel:nothing")).toHaveLength(0);
  expect(await request("elsewhere")).toHaveLength(0);
});

it("an extra dock ignores open requests", async () => {
  vi.mocked(windowLabel).mockReturnValue("dock-2");
  render(<Host />);
  await act(async () => {});
  expect(vi.mocked(listen).mock.calls.some(([event]) => event === "open-request")).toBe(false);
});
