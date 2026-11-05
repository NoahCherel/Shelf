import { afterEach, vi } from "vitest";
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

describe("the water's motion", () => {
  const fake = () => ({ pause: vi.fn(), play: vi.fn(), currentTime: 0 as number | null });
  const stub = (animations: unknown[]) => {
    (HTMLElement.prototype as unknown as { getAnimations: () => unknown[] }).getAnimations = () => animations;
  };

  afterEach(() => {
    delete (HTMLElement.prototype as unknown as { getAnimations?: unknown }).getAnimations;
    vi.useRealTimers();
  });

  it("while charging, moves eight times a second rather than at the screen's rate", () => {
    vi.useFakeTimers();
    const wave = fake();
    stub([wave]);
    render(<T data={state(50, true)} status="ready" />);
    expect(wave.pause).toHaveBeenCalled();
    vi.advanceTimersByTime(124);
    expect(wave.currentTime).toBe(0);
    vi.advanceTimersByTime(1);
    expect(wave.currentTime).toBe(125);
    vi.advanceTimersByTime(875);
    expect(wave.currentTime).toBe(1000);
  });

  it("stops ticking when unplugged", () => {
    vi.useFakeTimers();
    const wave = fake();
    stub([wave]);
    const { rerender } = render(<T data={state(50, true)} status="ready" />);
    rerender(<T data={state(50, false)} status="ready" />);
    vi.advanceTimersByTime(1000);
    expect(wave.currentTime).toBe(0);
  });

  it("not charging, nothing ticks", () => {
    vi.useFakeTimers();
    const wave = fake();
    stub([wave]);
    render(<T data={state(50, false)} status="ready" />);
    vi.advanceTimersByTime(1000);
    expect(wave.pause).not.toHaveBeenCalled();
  });
});
