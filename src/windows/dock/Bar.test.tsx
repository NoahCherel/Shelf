import { afterEach, beforeEach, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { DockBar, reportSize } from "./Bar";
import { useLayout } from "../../core/layout";
import { usePicker, useShell } from "../../core/shell";
import { useSettings } from "../../core/settings";

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
  const pin = { ...def("pin:app:code", "code"), Tile: () => <button type="button" aria-label="Visual Studio Code" /> };
  const widgets = [def("apps", "Apps"), def("clock", "Clock"), def("battery", "Battery"), def("system-status", "Status"), pin];
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
  reportSize(el, 6, true, "top", 0.25);
  expect(invoke).toHaveBeenCalledWith("set_dock_width", { width: 700.4, bar: 55, gap: 6, float: true, edge: "top", along: 0.25 });
});

it("skips an id with no widget instead of breaking", () => {
  useLayout.setState({ ids: ["clock", "missing"] });
  const { container } = render(<DockBar />);
  expect(slots(container).map((s) => s.dataset.widgetId)).toEqual(["clock"]);
});

it("a widget can open a panel instead of a card of its own", async () => {
  const { invoke } = await import("../../core/tauri");
  const { byId } = await import("../../core/byId");
  (byId("clock") as { panel?: unknown }).panel = "quick";
  const { container } = render(<DockBar />);
  vi.mocked(invoke).mockClear();
  fireEvent.click(slots(container)[0]);
  expect(invoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__panel:quick" }));
  delete (byId("clock") as { panel?: unknown }).panel;
});

it("opens a card over its tile on click, only for widgets that have one", async () => {
  const { invoke } = await import("../../core/tauri");
  const { byId } = await import("../../core/byId");
  (byId("clock") as { Card?: unknown }).Card = () => null;
  const { container } = render(<DockBar />);
  const [clock, apps] = slots(container);
  vi.mocked(invoke).mockClear();
  fireEvent.click(apps);
  expect(invoke).not.toHaveBeenCalledWith("open_card", expect.anything());
  fireEvent.click(clock);
  expect(invoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "clock" }));
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

describe("a widget's name on hover", () => {
  const tips = async () => {
    const { invoke } = await import("../../core/tauri");
    return vi.mocked(invoke).mock.calls.filter(([c]) => c === "preview_tip").map(([, a]) => (a as { text: string }).text);
  };
  const slot = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-widget-id="${id}"]`)!;

  afterEach(() => vi.useRealTimers());

  beforeEach(async () => {
    const { invoke } = await import("../../core/tauri");
    vi.mocked(invoke).mockClear();
    vi.useFakeTimers();
    useSettings.setState({ hoverNames: true });
    usePicker.setState({ open: false });
    useLayout.setState({ ids: ["clock", "apps", "system-status", "pin:app:code"] });
  });

  it("names a widget after the pointer rests on it", async () => {
    const { container } = render(<DockBar />);
    fireEvent.pointerEnter(slot(container, "clock"));
    act(() => vi.advanceTimersByTime(599));
    expect(await tips()).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    expect(await tips()).toEqual(["Clock"]);
  });

  it("leaving before the delay shows nothing", async () => {
    const { container } = render(<DockBar />);
    fireEvent.pointerEnter(slot(container, "clock"));
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerLeave(slot(container, "clock"));
    act(() => vi.advanceTimersByTime(1000));
    expect(await tips()).toEqual([]);
  });

  it("leaving takes the name down", async () => {
    const { invoke } = await import("../../core/tauri");
    const { container } = render(<DockBar />);
    fireEvent.pointerEnter(slot(container, "clock"));
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerLeave(slot(container, "clock"));
    expect(invoke).toHaveBeenCalledWith("preview_leave");
  });

  it("apps and status name their own parts", async () => {
    const { container } = render(<DockBar />);
    for (const id of ["apps", "system-status"]) {
      fireEvent.pointerEnter(slot(container, id));
      act(() => vi.advanceTimersByTime(1000));
      fireEvent.pointerLeave(slot(container, id));
    }
    expect(await tips()).toEqual([]);
  });

  it("no names while the picker is open or with names on hover off", async () => {
    usePicker.setState({ open: true });
    const { container, unmount } = render(<DockBar />);
    fireEvent.pointerEnter(slot(container, "clock"));
    act(() => vi.advanceTimersByTime(1000));
    unmount();
    usePicker.setState({ open: false });
    useSettings.setState({ hoverNames: false });
    const again = render(<DockBar />);
    fireEvent.pointerEnter(slot(again.container, "clock"));
    act(() => vi.advanceTimersByTime(1000));
    expect(await tips()).toEqual([]);
  });

  it("a pinned app is named as its tile shows it", async () => {
    const { container } = render(<DockBar />);
    fireEvent.pointerEnter(slot(container, "pin:app:code"));
    act(() => vi.advanceTimersByTime(600));
    expect(await tips()).toEqual(["Visual Studio Code"]);
  });

  it("pressing a tile cancels its name", async () => {
    const { container } = render(<DockBar />);
    fireEvent.pointerEnter(slot(container, "clock"));
    fireEvent.pointerDown(slot(container, "clock"));
    act(() => vi.advanceTimersByTime(1000));
    expect(await tips()).toEqual([]);
  });
});
