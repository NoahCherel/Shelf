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
