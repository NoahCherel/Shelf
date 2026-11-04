import { beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { DockBar } from "./Bar";
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

it("skips an id with no widget instead of breaking", () => {
  useLayout.setState({ ids: ["clock", "missing"] });
  const { container } = render(<DockBar />);
  expect(slots(container).map((s) => s.dataset.widgetId)).toEqual(["clock"]);
});
