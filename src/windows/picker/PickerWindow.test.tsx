import { beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { invoke } from "../../core/tauri";
import { useLayout } from "../../core/layout";
import { PickerWindow } from "./PickerWindow";

const fetched = vi.hoisted(() => vi.fn(async () => "live"));

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

vi.mock("../../core/registry", () => {
  const def = (id: string, name: string, description: string, category: string) => ({
    id,
    name,
    description,
    category,
    width: 1,
    sample: `${id}-sample`,
    provider: { id, intervalMs: 1000, fetch: fetched },
    Tile: ({ data, preview }: { data: string; preview?: boolean }) => <div data-testid={`tile-${id}`}>{`${data}${preview ? " preview" : ""}`}</div>,
  });
  const widgets = [
    def("clock", "Clock", "Large readable time.", "clocks"),
    def("today", "Today", "Weekday and weather.", "clocks"),
    def("battery", "Battery", "Charge level.", "system"),
  ];
  return {
    widgets,
    byId: (id: string) => widgets.find((w) => w.id === id),
    byCategory: () => {
      const groups = new Map<string, typeof widgets>();
      for (const w of widgets) groups.set(w.category, [...(groups.get(w.category) ?? []), w]);
      return groups;
    },
  };
});

const pick = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  vi.mocked(invoke).mockClear();
  fetched.mockClear();
  useLayout.setState({ ids: ["clock"] });
});

it("lists every registered widget under its category", () => {
  render(<PickerWindow />);
  const clocks = screen.getByRole("region", { name: "Clocks" });
  expect(within(clocks).getByRole("button", { name: "Clock" })).toBeTruthy();
  expect(within(clocks).getByRole("button", { name: "Today" })).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "System" })).getByRole("button", { name: "Battery" })).toBeTruthy();
});

it("shows the All Widgets count and how many are in the bar", () => {
  render(<PickerWindow />);
  expect(screen.getByRole("heading", { name: "All Widgets" })).toBeTruthy();
  expect(screen.getByTestId("count").textContent).toBe("3");
  expect(screen.getByText("1 in bar")).toBeTruthy();
});

it("search filters by name", () => {
  render(<PickerWindow />);
  fireEvent.change(screen.getByPlaceholderText("Search widgets"), { target: { value: "batt" } });
  expect(pick("Battery")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Clock" })).toBeNull();
});

it("search filters by description", () => {
  render(<PickerWindow />);
  fireEvent.change(screen.getByPlaceholderText("Search widgets"), { target: { value: "weather" } });
  expect(pick("Today")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Battery" })).toBeNull();
});

it("says so when nothing matches", () => {
  render(<PickerWindow />);
  fireEvent.change(screen.getByPlaceholderText("Search widgets"), { target: { value: "zzz" } });
  expect(screen.getByText(/No widgets match/)).toBeTruthy();
});

it("clicking adds, and clicking again removes", () => {
  render(<PickerWindow />);
  fireEvent.click(pick("Battery"));
  expect(useLayout.getState().ids).toEqual(["clock", "battery"]);
  fireEvent.click(pick("Battery"));
  expect(useLayout.getState().ids).toEqual(["clock"]);
});

it("a check mark shows on widgets in the bar", () => {
  render(<PickerWindow />);
  expect(pick("Clock").querySelector(".pick__check")).toBeTruthy();
  expect(pick("Battery").querySelector(".pick__check")).toBeNull();
  expect(pick("Clock").getAttribute("aria-pressed")).toBe("true");
});

it("tiles draw from sample with preview set and run no provider", async () => {
  render(<PickerWindow />);
  expect(screen.getByTestId("tile-clock").textContent).toBe("clock-sample preview");
  await Promise.resolve();
  expect(fetched).not.toHaveBeenCalled();
});

it("closes through Rust", () => {
  render(<PickerWindow />);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(invoke).toHaveBeenCalledWith("close_window", { kind: "picker" });
});

it("selecting a category marks it", () => {
  Element.prototype.scrollIntoView = vi.fn();
  render(<PickerWindow />);
  fireEvent.click(screen.getByRole("button", { name: "System" }));
  expect(screen.getByRole("button", { name: "System" }).className).toContain("side__row--on");
});
