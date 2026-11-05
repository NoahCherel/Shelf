import { afterEach, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { invoke, listen } from "../../core/tauri";
import { widthOf } from "../../core/widget";
import apps from "./index";
import { AppsTile, stableOrder, type AppEntry } from "./Tile";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}) }));

const mockInvoke = vi.mocked(invoke);

const app = (key: string, open = false, active = false): AppEntry => ({
  key,
  name: key,
  pinned: !open,
  active,
  windows: open ? [{ hwnd: 1, title: `${key} window` }] : [],
});

beforeEach(() => {
  mockInvoke.mockClear();
});

it("keeps a stable order when focus changes", () => {
  const before = [app("a"), app("b"), app("c")];
  const after = [app("c"), app("a"), app("b")];
  expect(stableOrder(before, after).map((e) => e.key)).toEqual(["a", "b", "c"]);
});

it("adds new apps last and drops closed ones", () => {
  const before = [app("a"), app("b")];
  const after = [app("c"), app("b")];
  expect(stableOrder(before, after).map((e) => e.key)).toEqual(["b", "c"]);
});

it("shows a dot only for open apps", () => {
  const { container } = render(<AppsTile data={[app("shut"), app("open", true)]} status="ready" />);
  const dots = container.querySelectorAll(".app__dot");
  expect(dots.length).toBe(1);
  expect(dots[0].closest("button")?.getAttribute("aria-label")).toBe("open");
});

it("marks only the app in focus, so it's clear which one that is", () => {
  render(<AppsTile data={[app("other", true), app("focused", true, true)]} status="ready" />);
  expect(screen.getByRole("button", { name: "focused" }).className).toContain("app--active");
  expect(screen.getByRole("button", { name: "other" }).className).not.toContain("app--active");
});

it("activates on click", () => {
  render(<AppsTile data={[app("code", true)]} status="ready" />);
  fireEvent.click(screen.getByRole("button", { name: "code" }));
  expect(mockInvoke).toHaveBeenCalledWith("apps_activate", { key: "code" });
});

it("opens Start from the first tile", () => {
  render(<AppsTile data={[]} status="ready" />);
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(mockInvoke).toHaveBeenCalledWith("start_menu");
});

it("asks for each icon once, however often it redraws", () => {
  const data = [app("code", true)];
  const { rerender } = render(<AppsTile data={data} status="ready" />);
  rerender(<AppsTile data={[...data]} status="ready" />);
  expect(mockInvoke.mock.calls.filter((c) => c[0] === "apps_icon").length).toBeLessThanOrEqual(1);
});

it("asks again when an icon isn't ready yet", async () => {
  vi.useFakeTimers();
  mockInvoke.mockImplementation(async (cmd) => (cmd === "apps_icon" ? null : null));
  const { container } = render(<AppsTile data={[app("late", true)]} status="ready" />);
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(container.querySelector("img")).toBeNull();
  mockInvoke.mockImplementation(async (cmd) => (cmd === "apps_icon" ? "data:image/png;base64,AA" : null));
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(container.querySelector("img")?.getAttribute("src")).toContain("data:image/png");
  vi.useRealTimers();
});

it("has a Search button beside Start, as on Windows", () => {
  render(<AppsTile data={[]} status="ready" />);
  const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
  expect(names).toEqual(["Start", "Search"]);
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(mockInvoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__panel:search", width: 560 }));
  expect(mockInvoke).not.toHaveBeenCalledWith("shell_panel", expect.anything());
});

it("right-clicking an app asks for Windows' menu, not Shelf's", () => {
  const dock = vi.fn();
  render(
    <div onContextMenu={dock}>
      <AppsTile data={[app("code", true)]} status="ready" />
    </div>,
  );
  fireEvent.contextMenu(screen.getByRole("button", { name: "code" }));
  expect(mockInvoke).toHaveBeenCalledWith("apps_context_menu", { key: "code" });
  expect(dock).not.toHaveBeenCalled();
});

it("right-clicking Start asks for Windows' quick menu", () => {
  const dock = vi.fn();
  render(
    <div onContextMenu={dock}>
      <AppsTile data={[]} status="ready" />
    </div>,
  );
  fireEvent.contextMenu(screen.getByRole("button", { name: "Start" }));
  expect(mockInvoke.mock.calls.map((c) => c[0])).toContain("start_quick_menu");
  expect(dock).not.toHaveBeenCalled();
});

it("right-click does nothing in the picker", () => {
  render(<AppsTile data={[app("code", true)]} status="sample" preview />);
  fireEvent.contextMenu(screen.getByRole("button", { name: "code" }));
  expect(mockInvoke.mock.calls.filter((c) => c[0] === "apps_context_menu")).toEqual([]);
});

it("marks Start while its menu is open", async () => {
  render(<AppsTile data={[]} status="ready" />);
  const start = screen.getByRole("button", { name: "Start" });
  expect(start.className).not.toContain("app--active");
  const handler = vi.mocked(listen).mock.calls.filter((c) => c[0] === "start-open").at(-1)![1] as (open: boolean) => void;
  await act(async () => handler(true));
  expect(start.className).toContain("app--active");
  await act(async () => handler(false));
  expect(start.className).not.toContain("app--active");
});

it("each app gets as much room as a taskbar button", () => {
  expect(widthOf(apps, [app("a"), app("b")])).toBeCloseTo(0.96 * 4);
});

it("does nothing when clicked in the picker", () => {
  render(<AppsTile data={[app("code", true)]} status="sample" preview />);
  fireEvent.click(screen.getByRole("button", { name: "code" }));
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(mockInvoke.mock.calls.filter((c) => c[0] !== "apps_icon")).toEqual([]);
});

describe("several windows and previews", () => {
  const two = (key: string): AppEntry => ({ ...app(key, true), windows: [{ hwnd: 1, title: "one" }, { hwnd: 2, title: "two" }] });
  const button = (name: string) => screen.getByRole("button", { name });
  const closedHandler = () => vi.mocked(listen).mock.calls.filter((c) => c[0] === "preview-closed").at(-1)![1] as (e?: unknown) => void;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("an app with several windows is marked as such", () => {
    render(<AppsTile data={[two("a"), app("b", true)]} status="ready" />);
    expect(button("a").className).toContain("app--many");
    expect(button("b").className).not.toContain("app--many");
  });

  it("hovering an open app asks for its previews after a short pause", () => {
    render(<AppsTile data={[app("a", true)]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    act(() => vi.advanceTimersByTime(349));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_show", expect.anything());
    act(() => vi.advanceTimersByTime(1));
    expect(mockInvoke).toHaveBeenCalledWith("preview_show", expect.objectContaining({ key: "a" }));
  });

  it("passing over an icon asks for nothing", () => {
    render(<AppsTile data={[app("a", true)]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    fireEvent.mouseLeave(button("a"));
    act(() => vi.advanceTimersByTime(1000));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_show", expect.anything());
  });

  it("leaving lets the previews close", () => {
    render(<AppsTile data={[app("a", true)]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    act(() => vi.advanceTimersByTime(350));
    fireEvent.mouseLeave(button("a"));
    expect(mockInvoke).toHaveBeenCalledWith("preview_leave");
  });

  it("while previews show, the next icon swaps at once", () => {
    render(<AppsTile data={[app("a", true), app("b", true)]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    act(() => vi.advanceTimersByTime(350));
    fireEvent.mouseLeave(button("a"));
    fireEvent.mouseEnter(button("b"));
    expect(mockInvoke).toHaveBeenCalledWith("preview_show", expect.objectContaining({ key: "b" }));
  });

  it("once they've closed, the pause comes back", async () => {
    render(<AppsTile data={[app("a", true), app("b", true)]} status="ready" />);
    await act(async () => {});
    fireEvent.mouseEnter(button("a"));
    act(() => vi.advanceTimersByTime(350));
    fireEvent.mouseLeave(button("a"));
    act(() => closedHandler()());
    fireEvent.mouseEnter(button("b"));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_show", expect.objectContaining({ key: "b" }));
  });

  it("a pinned app that isn't open has no preview and keeps its name", () => {
    render(<AppsTile data={[app("a")]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    act(() => vi.advanceTimersByTime(1000));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_show", expect.anything());
    expect(button("a").getAttribute("title")).toBe("a");
  });

  it("an open app has previews instead of a tooltip", () => {
    render(<AppsTile data={[app("a", true)]} status="ready" />);
    expect(button("a").getAttribute("title")).toBeNull();
  });

  it("pressing an app hides the previews and cancels a pending one", () => {
    render(<AppsTile data={[app("a", true)]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    fireEvent.mouseDown(button("a"));
    expect(mockInvoke).toHaveBeenCalledWith("preview_hide");
    act(() => vi.advanceTimersByTime(1000));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_show", expect.anything());
  });

  it("the picker's sample shows no previews", () => {
    render(<AppsTile data={[app("a", true)]} status="sample" preview />);
    fireEvent.mouseEnter(button("a"));
    act(() => vi.advanceTimersByTime(1000));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_show", expect.anything());
  });
});
