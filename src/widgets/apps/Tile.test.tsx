import { afterEach, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { invoke, listen } from "../../core/tauri";
import { widthOf } from "../../core/widget";
import { useSettings } from "../../core/settings";
import apps from "./index";
import { AppsTile, canGroup, dragOutcome, dropAim, heldOver, isPulledOff, keptInside, markReordered, stableOrder, type AppEntry } from "./Tile";

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
  expect(mockInvoke).not.toHaveBeenCalledWith("open_card", expect.anything());
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

  it("a pinned app that isn't open shows its name after the same pause, in Windows' bubble", () => {
    render(<AppsTile data={[app("a")]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    act(() => vi.advanceTimersByTime(349));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_name", expect.anything());
    act(() => vi.advanceTimersByTime(1));
    expect(mockInvoke).toHaveBeenCalledWith("preview_name", expect.objectContaining({ key: "a" }));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_show", expect.anything());
  });

  it("apps have no browser tooltip, as the bubble shows their name", () => {
    render(<AppsTile data={[app("a"), app("b", true)]} status="ready" />);
    expect(button("a").getAttribute("title")).toBeNull();
    expect(button("b").getAttribute("title")).toBeNull();
  });

  it("with previews turned off, an open app shows its name instead", () => {
    useSettings.setState({ previews: false });
    render(<AppsTile data={[app("a", true)]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    act(() => vi.advanceTimersByTime(400));
    expect(mockInvoke).toHaveBeenCalledWith("preview_name", expect.objectContaining({ key: "a" }));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_show", expect.anything());
    useSettings.setState({ previews: true });
  });

  it("with names turned off, a closed app shows nothing on hover", () => {
    useSettings.setState({ hoverNames: false });
    render(<AppsTile data={[app("a")]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    act(() => vi.advanceTimersByTime(1000));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_name", expect.anything());
    useSettings.setState({ hoverNames: true });
  });

  it("pressing an app hides the previews and cancels a pending one", () => {
    render(<AppsTile data={[app("a", true)]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    fireEvent.mouseDown(button("a"));
    expect(mockInvoke).toHaveBeenCalledWith("preview_hide");
    act(() => vi.advanceTimersByTime(1000));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_show", expect.anything());
  });

  it("clicking an app with several windows shows them, and doesn't switch", () => {
    render(<AppsTile data={[two("a")]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    fireEvent.mouseDown(button("a"));
    fireEvent.click(button("a"));
    expect(mockInvoke).toHaveBeenCalledWith("preview_show", expect.objectContaining({ key: "a" }));
    expect(mockInvoke).not.toHaveBeenCalledWith("apps_activate", expect.anything());
  });

  it("clicking again closes them", () => {
    render(<AppsTile data={[two("a")]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    act(() => vi.advanceTimersByTime(350));
    mockInvoke.mockClear();
    fireEvent.mouseDown(button("a"));
    fireEvent.click(button("a"));
    expect(mockInvoke).toHaveBeenCalledWith("preview_hide");
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_show", expect.anything());
    expect(mockInvoke).not.toHaveBeenCalledWith("apps_activate", expect.anything());
  });

  it("pressing an app with several windows doesn't close them first", () => {
    render(<AppsTile data={[two("a")]} status="ready" />);
    fireEvent.mouseEnter(button("a"));
    act(() => vi.advanceTimersByTime(350));
    mockInvoke.mockClear();
    fireEvent.mouseDown(button("a"));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_hide");
  });

  it("clicking an app with one window still brings it forward", () => {
    render(<AppsTile data={[app("a", true)]} status="ready" />);
    fireEvent.click(button("a"));
    expect(mockInvoke).toHaveBeenCalledWith("apps_activate", { key: "a" });
  });

  it("right-clicking an app opens Shelf's menu for it, above it, and hides its previews", () => {
    render(<AppsTile data={[two("a")]} status="ready" />);
    fireEvent.contextMenu(button("a"));
    expect(mockInvoke).toHaveBeenCalledWith("preview_hide");
    expect(mockInvoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__appmenu:a" }));
    expect(mockInvoke).not.toHaveBeenCalledWith("apps_context_menu", expect.anything());
  });

  it("the picker's sample shows no previews", () => {
    render(<AppsTile data={[app("a", true)]} status="sample" preview />);
    fireEvent.mouseEnter(button("a"));
    act(() => vi.advanceTimersByTime(1000));
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_show", expect.anything());
  });
});

describe("an app arriving on the dock", () => {
  const icon = (name: string) => screen.getByRole("button", { name });

  it("what's there when the dock first loads doesn't animate", () => {
    const { rerender } = render(<AppsTile data={null} status="loading" />);
    rerender(<AppsTile data={[app("a", true), app("b", true)]} status="ready" />);
    expect(icon("a").className).not.toContain("app--new");
    expect(icon("b").className).not.toContain("app--new");
  });

  it("a new app slides in", () => {
    const { rerender } = render(<AppsTile data={[app("a", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a", true), app("b", true)]} status="ready" />);
    expect(icon("b").className).toContain("app--new");
    expect(icon("a").className).not.toContain("app--new");
  });

  it("another update mid-animation doesn't cut it short", () => {
    const { rerender } = render(<AppsTile data={[app("a", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a", true), app("b", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a", true), app("b", true, true)]} status="ready" />);
    expect(icon("b").className).toContain("app--new");
  });

  it("an app that closes and comes back slides in again", () => {
    const { rerender } = render(<AppsTile data={[app("a", true), app("b", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a", true), app("b", true)]} status="ready" />);
    expect(icon("b").className).toContain("app--new");
  });

  it("a pinned app opening doesn't slide, as its icon was already there", () => {
    const { rerender } = render(<AppsTile data={[app("a")]} status="ready" />);
    rerender(<AppsTile data={[app("a", true)]} status="ready" />);
    expect(icon("a").className).not.toContain("app--new");
  });

  it("the picker's sample stays still", () => {
    const { rerender } = render(<AppsTile data={[app("a")]} status="sample" preview />);
    rerender(<AppsTile data={[app("a"), app("b")]} status="sample" preview />);
    expect(icon("b").className).not.toContain("app--new");
  });
});

describe("an app leaving the dock", () => {
  const leaving = (container: HTMLElement) => [...container.querySelectorAll(".app--leaving")];
  const order = (container: HTMLElement) => [...container.querySelectorAll(".app")].map((e) => e.getAttribute("data-key")).filter(Boolean);

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays for a moment to fold away, then goes", () => {
    const { container, rerender } = render(<AppsTile data={[app("a", true), app("b", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a", true)]} status="ready" />);
    expect(leaving(container)).toHaveLength(1);
    act(() => vi.advanceTimersByTime(299));
    expect(leaving(container)).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(leaving(container)).toHaveLength(0);
    expect(order(container)).toEqual(["a"]);
  });

  it("folds away where it was, not at the end", () => {
    const { container, rerender } = render(<AppsTile data={[app("a", true), app("b", true), app("c", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a", true), app("c", true)]} status="ready" />);
    expect(order(container)).toEqual(["a", "b", "c"]);
  });

  it("can't be clicked or right-clicked while it goes", () => {
    const { container, rerender } = render(<AppsTile data={[app("a", true), app("b", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a", true)]} status="ready" />);
    mockInvoke.mockClear();
    const gone = leaving(container)[0];
    fireEvent.click(gone);
    fireEvent.contextMenu(gone);
    fireEvent.mouseEnter(gone);
    act(() => vi.advanceTimersByTime(100));
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(gone.getAttribute("aria-hidden")).toBe("true");
  });

  it("coming back while it folds keeps one icon, and it's no longer leaving", () => {
    const { container, rerender } = render(<AppsTile data={[app("a", true), app("b", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a", true), app("b", true)]} status="ready" />);
    expect(leaving(container)).toHaveLength(0);
    expect(order(container)).toEqual(["a", "b"]);
    act(() => vi.advanceTimersByTime(1000));
    expect(order(container)).toEqual(["a", "b"]);
  });

  it("several leaving together each go", () => {
    const { container, rerender } = render(<AppsTile data={[app("a", true), app("b", true), app("c", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a", true)]} status="ready" />);
    expect(leaving(container)).toHaveLength(2);
    act(() => vi.advanceTimersByTime(300));
    expect(order(container)).toEqual(["a"]);
  });

  it("a pinned app closing keeps its icon", () => {
    const { container, rerender } = render(<AppsTile data={[app("a", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a")]} status="ready" />);
    expect(leaving(container)).toHaveLength(0);
  });

  it("the picker's sample doesn't animate", () => {
    const { container, rerender } = render(<AppsTile data={[app("a"), app("b")]} status="sample" preview />);
    rerender(<AppsTile data={[app("a")]} status="sample" preview />);
    expect(leaving(container)).toHaveLength(0);
  });

  it("closing the dock mid-way leaves no timer behind", () => {
    const { rerender, unmount } = render(<AppsTile data={[app("a", true), app("b", true)]} status="ready" />);
    rerender(<AppsTile data={[app("a", true)]} status="ready" />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("dragging apps along the dock", () => {
  const T = 50;
  const list = [app("a"), app("b", true), app("c")];

  it("letting go over another app puts it there", () => {
    expect(dragOutcome({ active: "a", over: "c", dy: 0 }, list, T)).toEqual({ kind: "reorder", keys: ["b", "c", "a"] });
  });

  it("letting go where it started does nothing", () => {
    expect(dragOutcome({ active: "a", over: "a", dy: 0 }, list, T)).toBeNull();
    expect(dragOutcome({ active: "a", over: null, dy: 0 }, list, T)).toBeNull();
  });

  it("pulled well off the dock, a pinned app is unpinned", () => {
    expect(dragOutcome({ active: "a", over: "c", dy: -60 }, list, T)).toEqual({ kind: "unpin", key: "a" });
    expect(dragOutcome({ active: "a", over: "c", dy: 60 }, list, T)).toEqual({ kind: "unpin", key: "a" });
  });

  it("an open app that isn't pinned can't be pulled off, so it just goes back", () => {
    expect(dragOutcome({ active: "b", over: "a", dy: -60 }, list, T)).toBeNull();
  });

  it("is off once it's pulled further than most of a tile", () => {
    expect(isPulledOff(-44, T)).toBe(false);
    expect(isPulledOff(-46, T)).toBe(true);
  });

  it("after a drag, the next list from Rust is taken in its own order", async () => {
    mockInvoke.mockResolvedValueOnce([app("c"), app("a")]);
    markReordered();
    const next = await apps.provider!.fetch([app("a"), app("c")]);
    expect(next.map((e) => e.key)).toEqual(["c", "a"]);
    mockInvoke.mockResolvedValueOnce([app("c"), app("a")]);
    const later = await apps.provider!.fetch([app("a"), app("c")]);
    // Only that once.
    expect(later.map((e) => e.key)).toEqual(["a", "c"]);
  });

  it("pressing an app doesn't start moving the whole widget", () => {
    const outer = vi.fn();
    const { container } = render(
      <div onPointerDown={outer}>
        <AppsTile data={[app("a")]} status="ready" />
      </div>,
    );
    fireEvent.pointerDown(container.querySelector('[data-key="a"]')!, { button: 0, pointerId: 1 });
    expect(outer).not.toHaveBeenCalled();
    fireEvent.pointerDown(container.querySelector('[aria-label="Start"]')!, { button: 0, pointerId: 1 });
    expect(outer).toHaveBeenCalled();
  });
});

describe("an app dragged past either end of the apps", () => {
  const box = { left: 100, right: 400 };
  const icon = { left: 150, width: 48 };

  it("stops at the edge instead of sliding out of sight", () => {
    expect(keptInside(-500, icon, box)).toBe(-50);
    expect(keptInside(500, icon, box)).toBe(202);
  });

  it("moves freely in between", () => {
    expect(keptInside(30, icon, box)).toBe(30);
    expect(keptInside(-50, icon, box)).toBe(-50);
  });
});

describe("files, folders and groups", () => {
  const T = 50;
  const group: AppEntry = { ...app("group:1"), name: "Work", kind: "group", members: [app("a", true), app("b"), app("c"), app("d"), app("e")], windows: [{ hwnd: 1, title: "w" }] };
  const folder: AppEntry = { ...app("item:c:\\work"), name: "Work folder", kind: "folder" };
  const file: AppEntry = { ...app("item:c:\\a.txt"), name: "a.txt", kind: "file" };

  it("an app held over another is grouped with it when let go", () => {
    expect(dragOutcome({ active: "a", over: "b", dy: 0, onto: "b" }, [app("a"), app("b")], T)).toEqual({ kind: "group", onto: "b", key: "a" });
  });

  it("only apps go in groups, and only on an app or a group", () => {
    expect(canGroup(app("a"), app("b"))).toBe(true);
    expect(canGroup(app("a"), group)).toBe(true);
    expect(canGroup(app("a"), app("a"))).toBe(false);
    expect(canGroup(group, app("a"))).toBe(false);
    expect(canGroup(file, app("a"))).toBe(false);
    expect(canGroup(app("a"), folder)).toBe(false);
    expect(dragOutcome({ active: "a", over: "x", dy: 0, onto: "x" }, [app("a"), { ...file, key: "x" }], T)?.kind).toBe("reorder");
  });

  it("pulling off the dock wins over holding on an app", () => {
    expect(dragOutcome({ active: "a", over: "b", dy: 100, onto: "b" }, [app("a"), app("b")], T)).toEqual({ kind: "unpin", key: "a" });
  });

  it("an app counts as held over another only when near its middle", () => {
    expect(heldOver({ left: 100, width: 48 }, { left: 105, width: 48 }, T)).toBe(true);
    expect(heldOver({ left: 100, width: 48 }, { left: 130, width: 48 }, T)).toBe(false);
  });

  it("a group's tile shows four of its apps, a dot, and opens its card", () => {
    const { container } = render(<AppsTile data={[group]} status="ready" />);
    expect(container.querySelectorAll(".app__mini").length).toBe(4);
    expect(container.querySelectorAll(".app__dot").length).toBe(1);
    mockInvoke.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Work" }));
    expect(mockInvoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__group:group:1" }));
    expect(mockInvoke.mock.calls.map((c) => c[0])).not.toContain("apps_activate");
  });

  it("a folder opens its stack, and a file opens like an app", () => {
    render(<AppsTile data={[folder, file]} status="ready" />);
    fireEvent.click(screen.getByRole("button", { name: "Work folder" }));
    expect(mockInvoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__stack:item:c:\\work" }));
    fireEvent.click(screen.getByRole("button", { name: "a.txt" }));
    expect(mockInvoke).toHaveBeenCalledWith("apps_activate", { key: "item:c:\\a.txt" });
  });

  describe("what something dragged from Windows would do", () => {
    const tiles = [{ key: "a", left: 100, width: 40 }, { key: "b", left: 140, width: 40 }];
    const box = { left: 0, right: 200 };
    const yes = () => true;

    it("opens in the app at the middle of its icon", () => {
      expect(dropAim(120, tiles, null, box, false, yes)).toEqual({ open: "a" });
    });

    it("opens a place at the edges of an icon, on the nearer side", () => {
      expect(dropAim(103, tiles, null, box, false, yes)).toEqual({ place: 0 });
      expect(dropAim(137, tiles, null, box, false, yes)).toEqual({ place: 1 });
      expect(dropAim(177, tiles, null, box, false, yes)).toEqual({ place: 2 });
    });

    it("a program is always added, even at the middle of an icon", () => {
      expect(dropAim(120, tiles, null, box, true, yes)).toEqual({ place: 1 });
    });

    it("the middle of something that can't open it is only a place", () => {
      expect(dropAim(120, tiles, null, box, false, () => false)).toEqual({ place: 1 });
    });

    it("a place stays open while the pointer is in it", () => {
      expect(dropAim(150, tiles, { left: 140, width: 40, index: 1 }, box, false, yes)).toEqual({ place: 1 });
    });

    it("over the rest of the dock it goes last", () => {
      expect(dropAim(500, tiles, null, box, false, yes)).toEqual({ place: 2 });
    });

    it("before the first app it goes first", () => {
      expect(dropAim(50, tiles, null, box, false, yes)).toEqual({ place: 0 });
    });
  });

  describe("something dragged from Windows", () => {
    let handlers: Record<string, (p: unknown) => void>;
    const hints = () => mockInvoke.mock.calls.filter((c) => c[0] === "preview_hint").map((c) => (c[1] as { what: string }).what);
    async function shown(data: AppEntry[]) {
      handlers = {};
      vi.mocked(listen).mockImplementation(async (name: string, fn: (p: never) => void) => {
        handlers[name] = fn as (p: unknown) => void;
        return () => {};
      });
      const view = render(<AppsTile data={data} status="ready" />);
      await act(async () => {});
      view.container.querySelector<HTMLElement>(".apps")!.getBoundingClientRect = () => ({ left: 0, right: 400 }) as DOMRect;
      view.container.querySelectorAll<HTMLElement>("[data-key]").forEach((tile, i) => {
        tile.getBoundingClientRect = () => ({ left: 100 + i * 40, width: 40 }) as DOMRect;
      });
      mockInvoke.mockClear();
      return view;
    }
    afterEach(() => {
      vi.useRealTimers();
      vi.mocked(listen).mockImplementation(async () => () => {});
    });

    it("opens a place between the icons with a bubble, and closes it on leaving", async () => {
      const { container } = await shown([app("a"), app("b")]);
      act(() => handlers["os-drag"]({ x: 141, y: 10, pinnable: false }));
      expect(container.querySelector(".app--gap")).toBeTruthy();
      expect(mockInvoke).toHaveBeenCalledWith("apps_drag_target", { key: null, index: 1 });
      expect(hints()).toEqual(["add"]);
      act(() => handlers["os-drag"](null));
      expect(container.querySelector(".app--gap")).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith("apps_drag_target", { key: null, index: null });
      expect(mockInvoke).toHaveBeenCalledWith("preview_hide");
    });

    it("at the middle of an open app it offers to open there, and raises it after a moment", async () => {
      vi.useFakeTimers();
      const { container } = await shown([app("code", true)]);
      act(() => handlers["os-drag"]({ x: 120, y: 10, pinnable: false }));
      act(() => handlers["os-drag"]({ x: 121, y: 10, pinnable: false }));
      expect(container.querySelector(".app--gap")).toBeNull();
      expect(mockInvoke.mock.calls.filter((c) => c[0] === "apps_drag_target")).toEqual([["apps_drag_target", { key: "code", index: null }]]);
      expect(hints()).toEqual(["open"]);
      vi.advanceTimersByTime(1000);
      expect(mockInvoke).toHaveBeenCalledWith("apps_drag_raise", { key: "code" });
    });
  });
});
