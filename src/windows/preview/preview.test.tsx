import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import { invoke, listen } from "../../core/tauri";
import { PreviewWindow } from "./PreviewWindow";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(async () => null),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

const mockInvoke = vi.mocked(invoke);

const SHOWN = {
  key: "firefox",
  name: "Firefox",
  slotWidth: 220,
  windows: [
    { hwnd: 11, title: "First window", minimized: false },
    { hwnd: 22, title: "Second window", minimized: false },
    { hwnd: 33, title: "Put away", minimized: true },
  ],
};

const handler = (event: string) => vi.mocked(listen).mock.calls.filter((c) => c[0] === event).at(-1)![1] as (e: unknown) => void;

async function openIt(shown: unknown = SHOWN) {
  render(<PreviewWindow />);
  await act(async () => {});
  await act(async () => handler("preview-show")(shown));
}

const slotCalls = () => mockInvoke.mock.calls.filter((c) => c[0] === "preview_slots");
const lastSlots = () => (slotCalls().at(-1)![1] as { slots: { hwnd: number }[] }).slots.map((s) => s.hwnd);

beforeEach(() => {
  mockInvoke.mockClear();
  vi.mocked(listen).mockClear();
});

it("shows each window with its title", async () => {
  await openIt();
  expect(screen.getByText("First window")).toBeTruthy();
  expect(screen.getByText("Second window")).toBeTruthy();
});

it("tells Windows where each live picture goes, but not for a minimized window", async () => {
  await openIt();
  expect(lastSlots()).toEqual([11, 22]);
});

it("a minimized window shows the app's icon instead", async () => {
  await openIt();
  expect(mockInvoke).toHaveBeenCalledWith("apps_icon", { key: "firefox" });
  expect(document.querySelectorAll(".pv__icon")).toHaveLength(1);
});

it("clicking a window brings it forward and closes the previews", async () => {
  await openIt();
  fireEvent.click(screen.getByText("Second window"));
  expect(mockInvoke).toHaveBeenCalledWith("preview_activate", { hwnd: 22 });
});

it("the cross closes that window only, and its row goes", async () => {
  await openIt();
  fireEvent.click(screen.getByRole("button", { name: "Close First window" }));
  expect(mockInvoke).toHaveBeenCalledWith("preview_close_window", { hwnd: 11 });
  expect(mockInvoke).not.toHaveBeenCalledWith("preview_activate", expect.anything());
  expect(screen.queryByText("First window")).toBeNull();
  expect(lastSlots()).toEqual([22]);
});

it("closing the last window closes the previews", async () => {
  await openIt({ ...SHOWN, windows: [SHOWN.windows[0]] });
  fireEvent.click(screen.getByRole("button", { name: "Close First window" }));
  expect(mockInvoke).toHaveBeenCalledWith("preview_hide");
});

it("the pointer on the strip keeps it open, and leaving lets it close", async () => {
  await openIt();
  const strip = document.querySelector(".pv") as HTMLElement;
  fireEvent.mouseEnter(strip);
  expect(mockInvoke).toHaveBeenCalledWith("preview_keep");
  fireEvent.mouseLeave(strip);
  expect(mockInvoke).toHaveBeenCalledWith("preview_leave");
});

it("once closed it shows nothing", async () => {
  await openIt();
  await act(async () => handler("preview-closed")(undefined));
  expect(screen.queryByText("First window")).toBeNull();
});

it("a title is text, never HTML", async () => {
  await openIt({ ...SHOWN, windows: [{ hwnd: 1, title: "<img src=x onerror=alert(1)>", minimized: false }] });
  expect(document.querySelector("img[src='x']")).toBeNull();
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
});

it("a window with no title falls back to the app's name", async () => {
  await openIt({ ...SHOWN, windows: [{ hwnd: 1, title: "", minimized: false }] });
  expect(screen.getByText("Firefox")).toBeTruthy();
});
