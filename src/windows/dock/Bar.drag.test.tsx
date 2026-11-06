import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
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

beforeEach(() => {
  vi.mocked(invoke).mockClear();
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

describe("moving the dock to another edge", () => {
  const box = { width: 400, height: 55, left: 0, top: 0, right: 400, bottom: 55, x: 0, y: 0, toJSON: () => ({}) };
  const grab = (bar: HTMLElement, from: number, to: number) => {
    bar.setPointerCapture = vi.fn();
    bar.getBoundingClientRect = () => box;
    fireEvent.pointerDown(bar, { button: 0, pointerId: 1, screenY: from });
    fireEvent.pointerMove(bar, { pointerId: 1, screenY: to });
    fireEvent.pointerUp(bar, { pointerId: 1, screenY: to });
  };

  it("follows the pointer from an empty spot, and stays at the edge it's let go near", () => {
    Object.defineProperty(window.screen, "height", { value: 864, configurable: true });
    render(<DockBar />);
    grab(screen.getByTestId("bar"), 840, 100);
    expect(invoke).toHaveBeenCalledWith("dock_drag", { offset: -740 });
    expect(invoke).toHaveBeenCalledWith("dock_drag_end");
    expect(useSettings.getState().edge).toBe("top");
  });

  it("a short press doesn't move it", () => {
    render(<DockBar />);
    grab(screen.getByTestId("bar"), 840, 838);
    expect(invoke).not.toHaveBeenCalledWith("dock_drag", expect.anything());
    expect(useSettings.getState().edge).toBe("bottom");
  });

  it("a locked dock stays put, until the picker is open", () => {
    useSettings.setState({ lockDock: true });
    render(<DockBar />);
    grab(screen.getByTestId("bar"), 840, 100);
    expect(invoke).not.toHaveBeenCalledWith("dock_drag", expect.anything());
    expect(useSettings.getState().edge).toBe("bottom");
    act(() => usePicker.setState({ open: true }));
    grab(screen.getByTestId("bar"), 840, 100);
    expect(useSettings.getState().edge).toBe("top");
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
