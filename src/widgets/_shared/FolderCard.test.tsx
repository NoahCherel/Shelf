import { beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { folderWidget } from "../../core/folderWidget";
import { useLayout } from "../../core/layout";
import { defineWidget } from "../../core/widget";
import { invoke } from "../../core/tauri";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockDef = (id: string, name: string, category: "ai" | "clocks" = "ai") =>
  defineWidget({
    id,
    name,
    description: "",
    category,
    width: 2,
    Tile: () => <div className="tile">{name} tile</div>,
    Card: () => <div>{name} detail card</div>,
  });

const DEFS = [
  mockDef("claude-usage", "Claude Usage"),
  mockDef("grok-usage", "Grok Usage"),
  mockDef("glm-usage", "GLM Usage"),
  mockDef("cursor-usage", "Cursor Usage"),
  mockDef("clock", "Clock", "clocks"),
];
const resolve = (id: string) => DEFS.find((d) => d.id === id);

beforeEach(() => {
  vi.mocked(invoke).mockClear();
  useLayout.setState({
    ids: ["folder:ai"],
    positions: {},
    folders: { "folder:ai": { name: "AI", widgets: ["claude-usage", "grok-usage", "glm-usage", "cursor-usage", "clock"] } },
  });
});

describe("Widget Folders UI", () => {
  it("renders a 2x2 mini-grid with real widget logos and +N badge on the dock tile", () => {
    const def = folderWidget("folder:ai", resolve)!;
    const T = def.Tile;
    const { container } = render(<T data={null} status="ready" />);
    expect(container.querySelectorAll(".wfolder__cell")).toHaveLength(4);
    expect(container.querySelectorAll(".wfolder__cell svg").length).toBe(4);
    expect(screen.getByText("+1")).toBeTruthy();
    expect(def.width).toBe(1);
  });

  it("renders live child tiles, supports renaming, opening a child card and returning back", () => {
    const def = folderWidget("folder:ai", resolve)!;
    const C = def.Card!;
    render(<C data={null} status="ready" />);

    const input = screen.getByLabelText("Folder name") as HTMLInputElement;
    expect(input.value).toBe("AI");
    fireEvent.change(input, { target: { value: "AI Suite" } });
    fireEvent.blur(input);
    expect(useLayout.getState().folders["folder:ai"].name).toBe("AI Suite");

    // Clicking a child widget transitions to its detail card with a Back button.
    fireEvent.click(screen.getByText("Claude Usage tile"));
    expect(screen.getByText("Claude Usage detail card")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /AI Suite/ }));
    expect(screen.getByText("Grok Usage tile")).toBeTruthy();
  });

  it("moves a child back to dock or ungroups the whole folder", () => {
    const def = folderWidget("folder:ai", resolve)!;
    const C = def.Card!;
    render(<C data={null} status="ready" />);

    fireEvent.click(screen.getByRole("button", { name: "Move Clock to dock" }));
    expect(useLayout.getState().ids).toEqual(["folder:ai", "clock"]);
    expect(useLayout.getState().folders["folder:ai"].widgets).not.toContain("clock");

    fireEvent.click(screen.getByRole("button", { name: "Ungroup" }));
    expect(useLayout.getState().folders).toEqual({});
    expect(useLayout.getState().ids).toEqual(["claude-usage", "grok-usage", "glm-usage", "cursor-usage", "clock"]);
    expect(invoke).toHaveBeenCalledWith("close_card");
  });

  it("drags a widget outside the folder card to move it back to the dock", () => {
    const def = folderWidget("folder:ai", resolve)!;
    const C = def.Card!;
    const { container } = render(<C data={null} status="ready" />);

    const card = container.querySelector<HTMLElement>(".wfolder-card")!;
    card.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: 260, width: 320, height: 260, x: 0, y: 0, toJSON: () => ({}) });

    const item = container.querySelector<HTMLElement>('[data-folder-widget="clock"]')!;
    item.setPointerCapture = vi.fn();

    // Drag outside the right edge -> moves clock onto the dock right after folder:ai.
    fireEvent.pointerDown(item, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 360, clientY: 100 });
    expect(item.setPointerCapture).toHaveBeenCalledWith(1);
    expect(screen.getByText("Drop to move to dock")).toBeTruthy();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 360, clientY: 100 });

    expect(useLayout.getState().ids).toEqual(["folder:ai", "clock"]);
    expect(useLayout.getState().folders["folder:ai"].widgets).not.toContain("clock");

    // Drag another widget outside the left edge -> moves it before folder:ai.
    const grok = container.querySelector<HTMLElement>('[data-folder-widget="grok-usage"]')!;
    grok.setPointerCapture = vi.fn();
    fireEvent.pointerDown(grok, { button: 0, pointerId: 2, clientX: 100, clientY: 80 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: -40, clientY: 80 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: -40, clientY: 80 });

    expect(useLayout.getState().ids).toEqual(["grok-usage", "folder:ai", "clock"]);
    expect(useLayout.getState().folders["folder:ai"].widgets).not.toContain("grok-usage");
  });

  it("drags a widget onto another inside the folder to reorder", () => {
    const def = folderWidget("folder:ai", resolve)!;
    const C = def.Card!;
    const { container } = render(<C data={null} status="ready" />);

    const card = container.querySelector<HTMLElement>(".wfolder-card")!;
    card.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: 260, width: 320, height: 260, x: 0, y: 0, toJSON: () => ({}) });

    const claude = container.querySelector<HTMLElement>('[data-folder-widget="claude-usage"]')!;
    const grok = container.querySelector<HTMLElement>('[data-folder-widget="grok-usage"]')!;
    claude.getBoundingClientRect = () => ({ left: 10, top: 50, right: 150, bottom: 100, width: 140, height: 50, x: 10, y: 50, toJSON: () => ({}) });
    grok.getBoundingClientRect = () => ({ left: 10, top: 110, right: 150, bottom: 160, width: 140, height: 50, x: 10, y: 110, toJSON: () => ({}) });
    claude.setPointerCapture = vi.fn();

    fireEvent.pointerDown(claude, { button: 0, pointerId: 3, clientX: 50, clientY: 70 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 50, clientY: 130 });
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 50, clientY: 130 });

    expect(useLayout.getState().folders["folder:ai"].widgets.slice(0, 2)).toEqual(["grok-usage", "claude-usage"]);
  });
});
