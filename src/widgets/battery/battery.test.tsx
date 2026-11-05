import { vi } from "vitest";
import { render, screen } from "@testing-library/react";
import widget from "./index";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

it("clicking it opens quick settings", () => {
  expect(widget.panel).toBe("quick");
});

const T = widget.Tile;
const state = (percent: number, charging: boolean) => ({ cpu: 0, memory: 0, battery: { percent, charging } });

it("water height equals the percent", () => {
  const { container } = render(<T data={state(86, false)} status="ready" />);
  expect(container.querySelector<HTMLElement>(".battery__water")?.style.height).toBe("86%");
  expect(screen.getByText("86")).toBeTruthy();
});

it("shows a bolt only when charging", () => {
  const { container, rerender } = render(<T data={state(50, true)} status="ready" />);
  expect(container.querySelector(".battery__bolt")).toBeTruthy();
  rerender(<T data={state(50, false)} status="ready" />);
  expect(container.querySelector(".battery__bolt")).toBeNull();
});

it("turns orange at or below 20% when unplugged", () => {
  const { container, rerender } = render(<T data={state(20, false)} status="ready" />);
  expect(container.querySelector(".battery--low")).toBeTruthy();
  rerender(<T data={state(21, false)} status="ready" />);
  expect(container.querySelector(".battery--low")).toBeNull();
  rerender(<T data={state(10, true)} status="ready" />);
  expect(container.querySelector(".battery--low")).toBeNull();
});

it("animates only while charging", () => {
  const { container, rerender } = render(<T data={state(50, true)} status="ready" />);
  expect(container.querySelector(".battery--live")).toBeTruthy();
  rerender(<T data={state(50, false)} status="ready" />);
  expect(container.querySelector(".battery--live")).toBeNull();
});

it("a machine with no battery shows a plain state instead of breaking", () => {
  render(<T data={{ cpu: 0, memory: 0, battery: null }} status="ready" />);
  expect(screen.getByText("No battery")).toBeTruthy();
});

it("is square, in the system category", () => {
  expect(widget.width).toBe(1);
  expect(widget.category).toBe("system");
});
