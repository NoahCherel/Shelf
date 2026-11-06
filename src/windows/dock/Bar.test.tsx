import { beforeEach, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { DockBar, edgeAt, reportSize } from "./Bar";
import { useLayout } from "../../core/layout";
import { useShell } from "../../core/shell";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(async () => null),
  listen: vi.fn(async () => () => {}),
}));

vi.mock("../../core/registry", () => {
  const def = (id: string, name: string) => ({
    id,
    name,
    description: "",
    category: "system",
    width: 1,
    sample: "s",
    Tile: () => <div data-testid={`tile-${id}`} />,
  });
  const widgets = [def("apps", "Apps"), def("clock", "Clock"), def("battery", "Battery")];
  return { widgets, byId: (id: string) => widgets.find((w) => w.id === id) };
});

const slots = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("[data-widget-id]")];

beforeEach(() => {
  useLayout.setState({ ids: ["clock", "apps", "battery"] });
  useShell.setState({ fullscreen: false, locked: false });
});

it("renders one wrapper per layout id, in order", () => {
  const { container } = render(<DockBar />);
  expect(slots(container).map((s) => s.dataset.widgetId)).toEqual(["clock", "apps", "battery"]);
});

it("omits tiles while fullscreen so nothing draws", () => {
  useShell.setState({ fullscreen: true });
  const { container } = render(<DockBar />);
  expect(slots(container)).toEqual([]);
});

it("gives the apps tile the only shrinkable slot when the bar overflows", () => {
  const { container } = render(<DockBar />);
  const shrinkable = slots(container).filter((s) => s.classList.contains("slot--shrink"));
  expect(shrinkable.map((s) => s.dataset.widgetId)).toEqual(["apps"]);
});

it("reports its size with the gap and whether it floats", async () => {
  const { invoke } = await import("../../core/tauri");
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ width: 700.4, height: 54.5 }) as DOMRect;
  reportSize(el, 6, true, "top");
  expect(invoke).toHaveBeenCalledWith("set_dock_width", { width: 700.4, bar: 55, gap: 6, float: true, edge: "top" });
});

it("skips an id with no widget instead of breaking", () => {
  useLayout.setState({ ids: ["clock", "missing"] });
  const { container } = render(<DockBar />);
  expect(slots(container).map((s) => s.dataset.widgetId)).toEqual(["clock"]);
});

it("a widget can open a panel instead of a card of its own", async () => {
  const { invoke } = await import("../../core/tauri");
  const { byId } = await import("../../core/registry");
  (byId("clock") as { panel?: unknown }).panel = "quick";
  const { container } = render(<DockBar />);
  vi.mocked(invoke).mockClear();
  fireEvent.click(slots(container)[0]);
  expect(invoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__panel:quick" }));
  delete (byId("clock") as { panel?: unknown }).panel;
});

it("opens a card over its tile on click, only for widgets that have one", async () => {
  const { invoke } = await import("../../core/tauri");
  const { byId } = await import("../../core/registry");
  (byId("clock") as { Card?: unknown }).Card = () => null;
  const { container } = render(<DockBar />);
  const [clock, apps] = slots(container);
  vi.mocked(invoke).mockClear();
  fireEvent.click(apps);
  expect(invoke).not.toHaveBeenCalledWith("open_card", expect.anything());
  fireEvent.click(clock);
  expect(invoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "clock" }));
});

it("the dock goes to whichever half of the screen it's let go in", () => {
  expect(edgeAt(100, 864)).toBe("top");
  expect(edgeAt(431, 864)).toBe("top");
  expect(edgeAt(432, 864)).toBe("bottom");
  expect(edgeAt(860, 864)).toBe("bottom");
});

it("tells Rust about auto-hide when it starts and whenever it changes", async () => {
  const { invoke } = await import("../../core/tauri");
  const { useSettings } = await import("../../core/settings");
  vi.mocked(invoke).mockClear();
  render(<DockBar />);
  expect(invoke).toHaveBeenCalledWith("set_dock_behaviour", { autoHide: false, showOnDesktop: false });
  act(() => useSettings.setState({ autoHide: true }));
  expect(invoke).toHaveBeenCalledWith("set_dock_behaviour", { autoHide: true, showOnDesktop: false });
  act(() => useSettings.setState({ autoHide: false }));
});
