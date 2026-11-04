import { beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import widget from "./index";
import { useSettings, defaults } from "../../core/settings";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const T = widget.Tile;
const WHEN = new Date(2026, 9, 1, 17, 4).getTime();

beforeEach(() => useSettings.setState({ ...defaults(), hour24: false }));

it("matches its entry: red weekday, date, time, weather", () => {
  const { container } = render(<T data={WHEN} status="ready" preview />);
  expect(screen.getByText("THURSDAY").className).toContain("today__weekday");
  expect(screen.getByText("Oct 1")).toBeTruthy();
  expect(screen.getByText("5:04")).toBeTruthy();
  expect(screen.getByText("PM")).toBeTruthy();
  expect(screen.getByText("36°")).toBeTruthy();
  expect(container.querySelector(".today__divider")).toBeTruthy();
});

it("leaves out weather when no city is set", () => {
  render(<T data={WHEN} status="ready" />);
  expect(screen.queryByText(/°/)).toBeNull();
});
