import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { DockBar, handleDragEnd } from "./Bar";
import { dockMenuItems, Menu } from "../menu/Menu";
import { invoke } from "../../core/tauri";
import { useLayout } from "../../core/layout";
import { defaults, useSettings } from "../../core/settings";
import { usePicker } from "../../core/shell";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

vi.mock("../../core/registry", () => {
  const def = (id: string) => ({ id, name: id.toUpperCase(), description: "", category: "system", width: 1, Tile: () => <div>{id}</div> });
  const widgets = [def("apps"), def("clock"), def("battery")];
  return { widgets, byId: (id: string) => widgets.find((w) => w.id === id) };
});

/** Rust reads where the window was let go: the page saves what it says. */
const settleTo = (edge: "top" | "bottom", along: number) =>
  vi.mocked(invoke).mockImplementation(async (command: string) => (command === "dock_drag_settle" ? { edge, along } : null) as never);

beforeEach(() => {
  vi.mocked(invoke).mockClear();
  vi.mocked(invoke).mockImplementation(async () => null as never);
  useLayout.setState({ ids: ["apps", "clock", "battery"] });
  useSettings.setState({ ...defaults() });
  usePicker.setState({ open: false });
});

describe("removing", () => {
  it("shows − badges only while the picker is open", () => {
    render(<DockBar />);
    expect(screen.queryByRole("button", { name: "Remove CLOCK" })).toBeNull();
    act(() => usePicker.setState({ open: true }));
    expect(screen.getByRole("button", { name: "Remove CLOCK" })).toBeTruthy();
  });

  it("a badge removes that widget", () => {
    usePicker.setState({ open: true });
    render(<DockBar />);
    fireEvent.click(screen.getByRole("button", { name: "Remove CLOCK" }));
    expect(useLayout.getState().ids).toEqual(["apps", "battery"]);
  });
});

describe("dragging", () => {
  it("reorders through move", () => {
    handleDragEnd({ active: { id: "apps" }, over: { id: "battery" } });
    expect(useLayout.getState().ids).toEqual(["clock", "battery", "apps"]);
  });

  it("ignores a drop outside the bar or on itself", () => {
    handleDragEnd({ active: { id: "apps" }, over: null });
    handleDragEnd({ active: { id: "apps" }, over: { id: "apps" } });
    expect(useLayout.getState().ids).toEqual(["apps", "clock", "battery"]);
  });

  it("Lock dock blocks dragging, except while the picker is open", () => {
    useSettings.setState({ lockDock: true });
    const { container } = render(<DockBar />);
    const slot = () => container.querySelector<HTMLElement>('[data-widget-id="clock"]')!;
    expect(slot().dataset.locked).toBe("true");
    act(() => usePicker.setState({ open: true }));
    expect(slot().dataset.locked).toBe("false");
  });
});

describe("right-click", () => {
  it("opens the menu over the widget", () => {
    const { container } = render(<DockBar />);
    fireEvent.contextMenu(container.querySelector('[data-widget-id="clock"]')!);
    expect(invoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__menu:clock" }));
  });

  it("the dock offers Widgets…, Settings, Lock dock, Quit", () => {
    expect(dockMenuItems().map((i) => i.label)).toEqual(["Widgets…", "Settings", "Lock dock", "Quit"]);
  });

  it("widget items come first", () => {
    const labels = dockMenuItems([{ label: "Logout", onClick: () => {} }]).map((i) => i.label);
    expect(labels[0]).toBe("Logout");
  });

  it("menu items run and then close the menu", () => {
    const onClick = vi.fn();
    render(<Menu items={[{ label: "Go", onClick }]} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Go" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("close_card");
  });

  it("Quit calls Rust, and Lock dock flips the setting", () => {
    const items = dockMenuItems();
    items.find((i) => i.label === "Quit")!.onClick();
    expect(invoke).toHaveBeenCalledWith("quit");
    items.find((i) => i.label === "Lock dock")!.onClick();
    expect(useSettings.getState().lockDock).toBe(true);
  });

  it("Lock dock shows a tick when on", () => {
    useSettings.setState({ lockDock: true });
    expect(dockMenuItems().find((i) => i.label === "Lock dock")?.checked).toBe(true);
  });
});

describe("moving the pill along its edge", () => {
  it("follows the pointer sideways too, and stays where it's let go", async () => {
    settleTo("bottom", 68 / 736);
    render(<DockBar />);
    const bar = screen.getByTestId("bar");
    bar.setPointerCapture = vi.fn();
    bar.getBoundingClientRect = () => ({ width: 800, height: 55, left: 0, top: 0, right: 800, bottom: 55, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(bar, { button: 0, pointerId: 1, screenX: 700, screenY: 840 });
    fireEvent.pointerMove(bar, { pointerId: 1, screenX: 400, screenY: 840 });
    fireEvent.pointerUp(bar, { pointerId: 1, screenX: 400, screenY: 840 });
    expect(invoke).toHaveBeenCalledWith("dock_drag", { dx: -300, dy: 0 });
    await vi.waitFor(() => expect(useSettings.getState().pillAt).toBeCloseTo(68 / 736));
    expect(useSettings.getState().edge).toBe("bottom");
  });

  it("settles before letting go", async () => {
    settleTo("top", 0.2);
    render(<DockBar />);
    const bar = screen.getByTestId("bar");
    bar.setPointerCapture = vi.fn();
    fireEvent.pointerDown(bar, { button: 0, pointerId: 1, screenX: 700, screenY: 840 });
    fireEvent.pointerMove(bar, { pointerId: 1, screenX: 400, screenY: 100 });
    fireEvent.pointerUp(bar, { pointerId: 1, screenX: 400, screenY: 100 });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("dock_drag_end"));
    const order = vi.mocked(invoke).mock.calls.map(([command]) => command);
    expect(order.indexOf("dock_drag_settle")).toBeLessThan(order.indexOf("dock_drag_end"));
    expect(useSettings.getState().edge).toBe("top");
  });

  it("a full-width dock only changes edge", async () => {
    useSettings.setState({ dockWidth: "full", pillAt: 0.5 });
    settleTo("top", 0.9);
    render(<DockBar />);
    const bar = screen.getByTestId("bar");
    bar.setPointerCapture = vi.fn();
    fireEvent.pointerDown(bar, { button: 0, pointerId: 1, screenX: 700, screenY: 840 });
    fireEvent.pointerMove(bar, { pointerId: 1, screenX: 300, screenY: 100 });
    fireEvent.pointerUp(bar, { pointerId: 1, screenX: 300, screenY: 100 });
    await vi.waitFor(() => expect(useSettings.getState().edge).toBe("top"));
    expect(useSettings.getState().pillAt).toBe(0.5);
  });
});

describe("moving the dock to another edge", () => {
  const box = { width: 400, height: 55, left: 0, top: 0, right: 400, bottom: 55, x: 0, y: 0, toJSON: () => ({}) };
  const grab = (bar: HTMLElement, from: number, to: number) => {
    bar.setPointerCapture = vi.fn();
    bar.getBoundingClientRect = () => box;
    fireEvent.pointerDown(bar, { button: 0, pointerId: 1, screenY: from });
    fireEvent.pointerMove(bar, { pointerId: 1, screenY: to });
    fireEvent.pointerUp(bar, { pointerId: 1, screenY: to });
  };

  it("follows the pointer from an empty spot, and stays at the edge it's let go near", async () => {
    settleTo("top", 0.5);
    render(<DockBar />);
    grab(screen.getByTestId("bar"), 840, 100);
    expect(invoke).toHaveBeenCalledWith("dock_drag", { dx: 0, dy: -740 });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("dock_drag_end"));
    expect(useSettings.getState().edge).toBe("top");
  });

  it("a short press doesn't move it", () => {
    render(<DockBar />);
    grab(screen.getByTestId("bar"), 840, 838);
    expect(invoke).not.toHaveBeenCalledWith("dock_drag", expect.anything());
    expect(useSettings.getState().edge).toBe("bottom");
  });

  it("a locked dock stays put, until the picker is open", async () => {
    useSettings.setState({ lockDock: true });
    settleTo("top", 0.5);
    render(<DockBar />);
    grab(screen.getByTestId("bar"), 840, 100);
    expect(invoke).not.toHaveBeenCalledWith("dock_drag", expect.anything());
    expect(useSettings.getState().edge).toBe("bottom");
    act(() => usePicker.setState({ open: true }));
    grab(screen.getByTestId("bar"), 840, 100);
    await vi.waitFor(() => expect(useSettings.getState().edge).toBe("top"));
  });

  it("grabbing a widget moves the widget, not the dock", () => {
    render(<DockBar />);
    const tile = screen.getByText("clock");
    tile.setPointerCapture = vi.fn();
    fireEvent.pointerDown(tile, { button: 0, pointerId: 1, screenY: 840 });
    fireEvent.pointerMove(tile, { pointerId: 1, screenY: 100 });
    fireEvent.pointerUp(tile, { pointerId: 1, screenY: 100 });
    expect(invoke).not.toHaveBeenCalledWith("dock_drag", expect.anything());
  });
});

describe("narrowing the dock", () => {
  const sized = (el: HTMLElement, width: number) => {
    el.getBoundingClientRect = () => ({ width, height: 55, left: 0, top: 0, right: width, bottom: 55, x: 0, y: 0, toJSON: () => ({}) });
    el.setPointerCapture = vi.fn();
  };
  const pull = (end: HTMLElement, by: number) => {
    fireEvent.pointerDown(end, { button: 0, pointerId: 1, screenX: 500 });
    fireEvent.pointerMove(end, { pointerId: 1, screenX: 500 + by });
    fireEvent.pointerUp(end, { pointerId: 1, screenX: 500 + by });
  };

  it("pulling an end in narrows it from both sides, as it stays centred", () => {
    render(<DockBar />);
    sized(screen.getByTestId("bar"), 800);
    pull(screen.getByRole("separator", { name: "Right end" }), -100);
    expect(useSettings.getState().narrowWidth).toBe(600);
    pull(screen.getByRole("separator", { name: "Left end" }), 50);
    expect(useSettings.getState().narrowWidth).toBe(500);
  });

  it("never narrower than one tile", () => {
    render(<DockBar />);
    sized(screen.getByTestId("bar"), 300);
    pull(screen.getByRole("separator", { name: "Right end" }), -1000);
    expect(useSettings.getState().narrowWidth).toBe(useSettings.getState().size);
  });

  it("a narrowed dock is that wide and scrolls, and a double-click on an end undoes it", () => {
    useSettings.setState({ narrowWidth: 300 });
    Object.defineProperty(window.screen, "width", { value: 1920, configurable: true });
    render(<DockBar />);
    const bar = screen.getByTestId("bar");
    expect(bar.dataset.narrow).toBe("true");
    expect(bar.style.maxWidth).toBe("300px");
    fireEvent.doubleClick(screen.getByRole("separator", { name: "Left end" }));
    expect(useSettings.getState().narrowWidth).toBeNull();
  });

  it("a locked dock and a full-width one have no ends to pull", () => {
    useSettings.setState({ lockDock: true });
    const { unmount } = render(<DockBar />);
    expect(screen.queryByRole("separator", { name: "Right end" })).toBeNull();
    unmount();
    useSettings.setState({ lockDock: false, dockWidth: "full" });
    render(<DockBar />);
    expect(screen.queryByRole("separator", { name: "Right end" })).toBeNull();
  });

  it("the wheel slides it sideways, except over something with a wheel of its own", () => {
    useSettings.setState({ narrowWidth: 300 });
    const { container } = render(<DockBar />);
    const scroller = container.querySelector<HTMLElement>(".dock__scroll")!;
    scroller.scrollBy = vi.fn();
    fireEvent.wheel(screen.getByText("clock"), { deltaY: 120 });
    expect(scroller.scrollBy).toHaveBeenCalledWith({ left: 120, behavior: "smooth" });
    vi.mocked(scroller.scrollBy).mockClear();
    const own = document.createElement("span");
    own.dataset.ownWheel = "";
    screen.getByText("clock").appendChild(own);
    fireEvent.wheel(own, { deltaY: 120 });
    expect(scroller.scrollBy).not.toHaveBeenCalled();
  });
});

describe("changing the dock's width while it runs", () => {
  it("keeps every widget, from pill to full width and back", () => {
    const { container } = render(<DockBar />);
    for (const dockWidth of ["full", "pill", "full", "pill"] as const) {
      act(() => useSettings.setState({ dockWidth }));
      expect(container.querySelectorAll("[data-widget-id]").length).toBe(3);
    }
  });
});

describe("placing widgets anywhere on a full-width dock", () => {
  const rects = (widths: Record<string, number>, scroller: number) =>
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const id = (this as HTMLElement).dataset?.widgetId;
      const width = this.classList.contains("dock__scroll") ? scroller : id ? (widths[id] ?? 0) : 0;
      return { width, height: 50, left: 0, top: 0, right: width, bottom: 50, x: 0, y: 0, toJSON: () => ({}) };
    });
  const slot = (container: HTMLElement, id: string) => container.querySelector<HTMLElement>(`[data-widget-id="${id}"]`)!;
  const slide = (el: HTMLElement, by: number) => {
    el.setPointerCapture = vi.fn();
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 400 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 400 + by });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 400 + by });
  };

  beforeEach(() => {
    useSettings.setState({ dockWidth: "full" });
    useLayout.setState({ ids: ["apps", "clock", "battery"], positions: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("each widget sits at its saved spot", () => {
    rects({ apps: 100, clock: 100, battery: 100 }, 1000);
    useLayout.setState({ positions: { apps: 0, clock: 0.5, battery: 1 } });
    const { container } = render(<DockBar />);
    expect(["apps", "clock", "battery"].map((id) => slot(container, id).style.left)).toEqual(["0px", "450px", "900px"]);
  });

  it("dragging one puts it exactly where it's let go, and saves that", () => {
    rects({ apps: 100, clock: 100, battery: 100 }, 1000);
    const { container } = render(<DockBar />);
    expect(slot(container, "clock").style.left).toBe("450px");
    slide(slot(container, "clock"), 300);
    expect(useLayout.getState().positions.clock).toBeCloseTo(750 / 900);
    expect(useLayout.getState().ids).toEqual(["apps", "battery", "clock"]);
    expect(slot(container, "clock").style.left).toBe("750px");
  });

  it("letting go doesn't also click the widget", () => {
    rects({ apps: 100, clock: 100, battery: 100 }, 1000);
    const { container } = render(<DockBar />);
    const clock = slot(container, "clock");
    slide(clock, 300);
    vi.mocked(invoke).mockClear();
    fireEvent.click(clock);
    expect(invoke).not.toHaveBeenCalledWith("open_card", expect.anything());
  });

  it("a locked dock keeps its widgets where they are", () => {
    rects({ apps: 100, clock: 100, battery: 100 }, 1000);
    useSettings.setState({ lockDock: true });
    const { container } = render(<DockBar />);
    slide(slot(container, "clock"), 300);
    expect(useLayout.getState().positions.clock).toBeUndefined();
  });

  it("a pill keeps its widgets in a row, whatever was saved", () => {
    rects({ apps: 100, clock: 100, battery: 100 }, 1000);
    useSettings.setState({ dockWidth: "pill" });
    useLayout.setState({ positions: { clock: 1 } });
    const { container } = render(<DockBar />);
    expect(slot(container, "clock").style.left).toBe("");
  });
});

describe("pressing a widget on a full-width dock", () => {
  beforeEach(() => {
    useSettings.setState({ dockWidth: "full" });
  });

  it("only takes the pointer once it really moves, so buttons inside still get their click", () => {
    const { container } = render(<DockBar />);
    const clock = container.querySelector<HTMLElement>('[data-widget-id="clock"]')!;
    clock.setPointerCapture = vi.fn();
    fireEvent.pointerDown(clock, { button: 0, pointerId: 1, clientX: 400 });
    fireEvent.pointerMove(clock, { pointerId: 1, clientX: 402 });
    fireEvent.pointerUp(clock, { pointerId: 1, clientX: 402 });
    expect(clock.setPointerCapture).not.toHaveBeenCalled();
    fireEvent.pointerDown(clock, { button: 0, pointerId: 2, clientX: 400 });
    fireEvent.pointerMove(clock, { pointerId: 2, clientX: 460 });
    expect(clock.setPointerCapture).toHaveBeenCalledWith(2);
    fireEvent.pointerUp(clock, { pointerId: 2, clientX: 460 });
  });
});

describe("moving a pill by its top and bottom borders", () => {
  it("both borders grab the dock, and its ends still narrow it", async () => {
    settleTo("top", 0.5);
    render(<DockBar />);
    for (const name of ["Top border", "Bottom border"]) {
      const grip = screen.getByRole("separator", { name });
      grip.setPointerCapture = vi.fn();
      useSettings.setState({ edge: "bottom" });
      fireEvent.pointerDown(grip, { button: 0, pointerId: 1, screenX: 500, screenY: 840 });
      fireEvent.pointerMove(grip, { pointerId: 1, screenX: 500, screenY: 100 });
      fireEvent.pointerUp(grip, { pointerId: 1, screenX: 500, screenY: 100 });
      await vi.waitFor(() => expect(useSettings.getState().edge).toBe("top"));
    }
    expect(screen.getByRole("separator", { name: "Right end" })).toBeTruthy();
  });

  it("a locked dock's borders don't move it", () => {
    useSettings.setState({ lockDock: true });
    render(<DockBar />);
    expect(screen.queryByRole("separator", { name: "Top border" })).toBeNull();
  });
});

describe("widgets coming and going", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const cls = (container: HTMLElement, id: string) => container.querySelector(`[data-widget-id="${id}"]`)?.className ?? null;

  it("nothing opens up when the dock first shows its widgets", () => {
    useLayout.setState({ ids: [] });
    const { container } = render(<DockBar />);
    act(() => useLayout.setState({ ids: ["apps", "clock"] }));
    expect(cls(container, "clock")).not.toContain("slot--new");
  });

  it("a widget added afterwards opens up", () => {
    useLayout.setState({ ids: ["apps", "clock"] });
    const { container } = render(<DockBar />);
    act(() => useLayout.setState({ ids: ["apps", "clock", "battery"] }));
    expect(cls(container, "battery")).toContain("slot--new");
    expect(cls(container, "clock")).not.toContain("slot--new");
  });

  it("a widget removed folds away where it was, then goes", () => {
    vi.useFakeTimers();
    const { container } = render(<DockBar />);
    act(() => useLayout.setState({ ids: ["apps", "battery"] }));
    expect(cls(container, "clock")).toContain("slot--leaving");
    expect([...container.querySelectorAll("[data-widget-id]")].map((e) => (e as HTMLElement).dataset.widgetId)).toEqual(["apps", "clock", "battery"]);
    act(() => vi.advanceTimersByTime(300));
    expect(cls(container, "clock")).toBeNull();
  });

  it("a widget folding away can't be clicked", () => {
    vi.useFakeTimers();
    const { container } = render(<DockBar />);
    act(() => useLayout.setState({ ids: ["apps", "battery"] }));
    expect(container.querySelector('[data-widget-id="clock"]')?.getAttribute("aria-hidden")).toBe("true");
  });
});

it("at full width, a widget folding away stays where it was rather than jumping", () => {
  vi.useFakeTimers();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const width = this.classList.contains("dock__scroll") ? 1000 : (this as HTMLElement).dataset?.widgetId ? 100 : 0;
    return { width, height: 50, left: 0, top: 0, right: width, bottom: 50, x: 0, y: 0, toJSON: () => ({}) };
  });
  useSettings.setState({ dockWidth: "full" });
  useLayout.setState({ ids: ["apps", "clock", "battery"], positions: { apps: 0, clock: 0.5, battery: 1 } });
  const { container } = render(<DockBar />);
  act(() => useLayout.setState({ ids: ["apps", "battery"], positions: { apps: 0, battery: 1 } }));
  expect(container.querySelector<HTMLElement>('[data-widget-id="clock"]')!.style.left).toBe("450px");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("a dock drag Windows cuts short still tells Rust it's over, without moving the dock", () => {
  Object.defineProperty(window.screen, "height", { value: 864, configurable: true });
  render(<DockBar />);
  const bar = screen.getByTestId("bar");
  bar.setPointerCapture = vi.fn();
  fireEvent.pointerDown(bar, { button: 0, pointerId: 1, screenX: 500, screenY: 840 });
  fireEvent.pointerMove(bar, { pointerId: 1, screenX: 500, screenY: 100 });
  vi.mocked(invoke).mockClear();
  fireEvent.lostPointerCapture(bar, { pointerId: 1 });
  expect(invoke).toHaveBeenCalledWith("dock_drag_end");
  expect(useSettings.getState().edge).toBe("bottom");
  vi.mocked(invoke).mockClear();
  fireEvent.pointerUp(bar, { pointerId: 1, screenX: 500, screenY: 100 });
  expect(invoke).not.toHaveBeenCalledWith("dock_drag_end");
});
