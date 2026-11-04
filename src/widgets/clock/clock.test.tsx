import { beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import widget from "./index";
import { DateCard } from "../_shared/DateCard";
import { useSettings, defaults } from "../../core/settings";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const T = widget.Tile;
const WHEN = new Date(2026, 9, 11, 17, 43, 59).getTime();

beforeEach(() => useSettings.setState({ ...defaults(), hour24: false, seconds: true }));

it("shows time, seconds, suffix and date", () => {
  render(<T data={WHEN} status="ready" />);
  expect(screen.getByText("5:43")).toBeTruthy();
  expect(screen.getByText(":59")).toBeTruthy();
  expect(screen.getByText("PM")).toBeTruthy();
  expect(screen.getByText("Sun 11 Oct")).toBeTruthy();
});

it("hides seconds when turned off", () => {
  useSettings.setState({ seconds: false });
  render(<T data={WHEN} status="ready" />);
  expect(screen.queryByText(":59")).toBeNull();
});

it("clicking any clock opens the date card", () => {
  expect(widget.Card).toBe(DateCard);
});

describe("date card", () => {
  const D = widget.Card!;

  it("draws the month with today marked", () => {
    const { container } = render(<D data={WHEN} status="ready" />);
    expect(screen.getByText("October 2026")).toBeTruthy();
    expect(container.querySelector(".date__today")?.textContent).toBe("11");
    expect(container.querySelectorAll(".date__day").length).toBe(31);
  });

  it("asks for a city when none is set", () => {
    render(<D data={WHEN} status="ready" />);
    expect(screen.getByPlaceholderText("Add a city for weather")).toBeTruthy();
  });
});
