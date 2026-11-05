import { beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import widget from "./index";
import { useSettings, defaults } from "../../core/settings";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const T = widget.Tile;
const NOON = new Date(2026, 9, 11, 17, 49).getTime();

beforeEach(() => {
  useSettings.setState({ ...defaults(), hour24: false });
});

it("shows time in the red block", () => {
  const { container } = render(<T data={NOON} status="ready" preview />);
  const top = container.querySelector<HTMLElement>(".cw__top")!;
  expect(top.textContent).toContain("5:49");
  expect(top.textContent).toContain("PM");
});

it("shows weekday and day in the black block", () => {
  const { container } = render(<T data={NOON} status="ready" preview />);
  const block = container.querySelector<HTMLElement>(".cw__date")!;
  expect(block.textContent).toContain("Sun");
  expect(block.textContent).toContain("11");
});

it("shows the sample temperature in the circle when previewed", () => {
  const { container } = render(<T data={NOON} status="sample" preview />);
  expect(container.querySelector(".cw__temp")?.textContent).toBe("22°");
});

it("shows – when no city is set", () => {
  const { container } = render(<T data={NOON} status="ready" />);
  expect(container.querySelector(".cw__temp")?.textContent).toBe("–");
});

it("honours 24-hour time", () => {
  useSettings.setState({ hour24: true });
  render(<T data={NOON} status="ready" preview />);
  expect(screen.getByText("17:49")).toBeTruthy();
});

it("has no red block", () => {
  const { container } = render(<T data={NOON} status="ready" preview />);
  expect(container.querySelector(".tile--solid")).toBeNull();
});

it("draws no empty circle when there's no temperature", () => {
  const { container } = render(<T data={NOON} status="ready" />);
  expect(container.querySelector<HTMLElement>(".cw__temp")?.dataset.empty).toBe("true");
});

it("is square", () => {
  expect(widget.width).toBe(1);
});

it("opens the date card", () => {
  expect(widget.Card).toBeTruthy();
});
