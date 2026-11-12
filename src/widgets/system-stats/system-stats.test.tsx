import { vi } from "vitest";
import { render, screen } from "@testing-library/react";
import widget from "./index";
import { toSystem } from "../../providers/system";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const T = widget.Tile;

it("shows two rings with value and label", () => {
  const { container } = render(<T data={{ cpu: 9, memory: 69, battery: null }} status="ready" />);
  expect(container.querySelectorAll(".ring").length).toBe(2);
  expect(screen.getByText("9")).toBeTruthy();
  expect(screen.getByText("CPU")).toBeTruthy();
  expect(screen.getByText("69")).toBeTruthy();
  expect(screen.getByText("RAM")).toBeTruthy();
});

it("draws nothing broken before the first reading", () => {
  const { container } = render(<T data={null} status="loading" />);
  expect(container.querySelectorAll(".ring").length).toBe(2);
});

it("toSystem rounds to whole percents", () => {
  const s = toSystem({ cpu: 8.6, mem_used: 690, mem_total: 1000, battery: { percent: 86, charging: true } });
  expect(s).toEqual({ cpu: 9, memory: 69, battery: { percent: 86, charging: true } });
});

it("toSystem survives a zero total", () => {
  expect(toSystem({ cpu: 0, mem_used: 0, mem_total: 0, battery: null }).memory).toBe(0);
});
