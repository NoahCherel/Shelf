import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
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

it("tells Windows where each picture goes, minimized windows included", async () => {
  await openIt();
  expect(lastSlots()).toEqual([11, 22, 33]);
});

it("a minimized window keeps the app's icon under its picture, for when Windows has none", async () => {
  await openIt();
  expect(mockInvoke).toHaveBeenCalledWith("apps_icon", { key: "firefox" });
  const frame = document.querySelector('[data-hwnd="33"]');
  expect(frame?.querySelector(".pv__icon")).toBeTruthy();
  expect(document.querySelector('[data-hwnd="11"]')?.querySelector(".pv__icon")).toBeNull();
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
  expect(lastSlots()).toEqual([22, 33]);
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

describe("resting on a picture", () => {
  const peeks = () => mockInvoke.mock.calls.filter((c) => c[0] === "preview_peek").map((c) => (c[1] as { hwnd: number | null }).hwnd);
  const picture = (title: string) => screen.getByText(title).closest(".pv__window") as HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows that window after a short pause", async () => {
    await openIt();
    fireEvent.mouseEnter(picture("First window"));
    await act(() => vi.advanceTimersByTimeAsync(249));
    expect(peeks()).toEqual([]);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(peeks()).toEqual([11]);
  });

  it("passing over a picture shows nothing", async () => {
    await openIt();
    fireEvent.mouseEnter(picture("First window"));
    fireEvent.mouseLeave(picture("First window"));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(peeks()).toEqual([]);
  });

  it("leaving the picture puts things back after a moment", async () => {
    await openIt();
    fireEvent.mouseEnter(picture("First window"));
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.mouseLeave(picture("First window"), { relatedTarget: document.querySelector(".pv") });
    expect(peeks()).toEqual([11]);
    await act(() => vi.advanceTimersByTimeAsync(120));
    expect(peeks()).toEqual([11, null]);
  });

  it("moving between pictures goes straight from one window to the other", async () => {
    await openIt();
    fireEvent.mouseEnter(picture("First window"));
    await act(() => vi.advanceTimersByTimeAsync(250));
    // Leaving towards the next picture is also what enters it.
    fireEvent.mouseLeave(picture("First window"), { relatedTarget: picture("Second window") });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(peeks()).toEqual([11, 22]);
  });

  it("crossing the gap between two pictures doesn't flash back", async () => {
    await openIt();
    fireEvent.mouseEnter(picture("First window"));
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.mouseLeave(picture("First window"), { relatedTarget: document.querySelector(".pv") });
    await act(() => vi.advanceTimersByTimeAsync(60));
    // Leaving the strip's background towards a picture is what enters that picture.
    fireEvent.mouseLeave(document.querySelector(".pv") as HTMLElement, { relatedTarget: picture("Second window") });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(peeks()).toEqual([11, 22]);
  });

  it("once the pointer has left the strip, the pause comes back", async () => {
    await openIt();
    fireEvent.mouseEnter(picture("First window"));
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.mouseLeave(picture("First window"));
    await act(() => vi.advanceTimersByTimeAsync(120));
    fireEvent.mouseEnter(picture("Second window"));
    expect(peeks()).toEqual([11, null]);
  });

  it("the pointer moving on a picture wins it back if the page lost track", async () => {
    await openIt();
    fireEvent.mouseEnter(picture("First window"));
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.mouseLeave(picture("First window"), { relatedTarget: document.querySelector(".pv") });
    await act(() => vi.advanceTimersByTimeAsync(120));
    fireEvent.mouseMove(picture("First window"));
    expect(peeks()).toEqual([11, null, 11]);
    fireEvent.mouseMove(picture("First window"));
    expect(peeks()).toEqual([11, null, 11]);
  });

  it("requests are numbered, and keep rising when the strip reopens", async () => {
    await openIt();
    fireEvent.mouseEnter(picture("First window"));
    await act(() => vi.advanceTimersByTimeAsync(250));
    const seqs = () => mockInvoke.mock.calls.filter((c) => c[0] === "preview_peek").map((c) => (c[1] as { seq: number }).seq);
    await act(async () => handler("preview-closed")(undefined));
    await act(async () => handler("preview-show")(SHOWN));
    fireEvent.mouseEnter(picture("Second window"));
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(seqs()[1]).toBeGreaterThan(seqs()[0]);
  });
});

it("with no windows to show, it's the app's name in a bubble", async () => {
  await openIt({ key: "discord", name: "Discord", slotWidth: 0, windows: [] });
  expect(screen.getByText("Discord").className).toContain("pv-name");
  expect(screen.queryByRole("button", { name: /Close/ })).toBeNull();
});
