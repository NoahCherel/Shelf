import { useEffect } from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { emit, invoke, listen } from "../core/tauri";
import { CardWindow } from "../windows/card/CardWindow";
import { goToPanel, openPanel, panels, statusChanged } from "./index";

vi.mock("../core/tauri", () => ({
  invoke: vi.fn(async () => null),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

const mockInvoke = vi.mocked(invoke);
const left = vi.fn();

function FakePanel() {
  useEffect(() => left, []);
  return <input aria-label="typed" />;
}

const anchor = () => {
  const el = document.createElement("button");
  el.getBoundingClientRect = () => ({ left: 700, width: 40 }) as DOMRect;
  return el;
};

const handler = (event: string) => vi.mocked(listen).mock.calls.filter((c) => c[0] === event).at(-1)![1] as (p?: unknown) => void;

beforeEach(() => {
  mockInvoke.mockClear();
  vi.mocked(listen).mockClear();
  left.mockClear();
  panels.sound = { Card: FakePanel, width: 340 };
});

afterEach(() => {
  delete panels.sound;
});

async function openIt() {
  render(<CardWindow />);
  await act(async () => {});
  await act(async () => handler("card-open")("__panel:sound"));
}

it("the card window shows a panel for a __panel: id", async () => {
  await openIt();
  expect(screen.getByLabelText("typed")).toBeTruthy();
});

it("openPanel centres the card on the part that was clicked", () => {
  openPanel("sound", anchor());
  expect(mockInvoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__panel:sound", tileX: 700, tileWidth: 40, width: 340 }));
});

it("closing a card unmounts it, so its providers stop", async () => {
  await openIt();
  await act(async () => handler("card-closed")());
  expect(screen.queryByLabelText("typed")).toBeNull();
  expect(left).toHaveBeenCalledOnce();
});

it("closing a card clears what was typed in it", async () => {
  await openIt();
  fireEvent.change(screen.getByLabelText("typed"), { target: { value: "hunter2" } });
  await act(async () => handler("card-closed")());
  expect(document.body.innerHTML).not.toContain("hunter2");
});

it("reopening a card starts it fresh", async () => {
  await openIt();
  fireEvent.change(screen.getByLabelText("typed"), { target: { value: "hunter2" } });
  await act(async () => handler("card-closed")());
  await act(async () => handler("card-open")("__panel:sound"));
  expect((screen.getByLabelText("typed") as HTMLInputElement).value).toBe("");
});

it("every panel has its card", () => {
  for (const id of ["wifi", "quick", "bluetooth", "search"] as const) expect(panels[id]).toBeTruthy();
});

it("goToPanel swaps the card without moving it", () => {
  goToPanel("sound");
  expect(mockInvoke).toHaveBeenCalledWith("swap_card", { widgetId: "__panel:sound", width: 340 });
});

it("a change made in a card refreshes the dock's status tile", () => {
  statusChanged();
  expect(emit).toHaveBeenCalledWith("provider-refresh", "status");
});
