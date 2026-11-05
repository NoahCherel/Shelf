import { afterEach, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import usage from "./index";
import plan from "../claude-plan-usage/index";
import { invoke } from "../../core/tauri";
import type { ClaudeData } from "../_providers/claude";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);
const inMs = (ms: number) => Date.now() + ms;
const DATA: ClaudeData = {
  session: { percent: 41, resetsAt: inMs(85 * 60_000 + 30_000) },
  weekly: { percent: 72, resetsAt: inMs(4 * 86_400_000) },
  updatedMs: 1,
};

beforeEach(() => {
  mockInvoke.mockClear();
});

describe("Claude Usage tile", () => {
  const T = usage.Tile;

  it("shows orange logo, Session, time and percent", () => {
    const { container } = render(<T data={DATA} status="ready" />);
    expect(container.querySelector<HTMLElement>(".claude-logo")).toBeTruthy();
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("1h 26m")).toBeTruthy();
    expect(screen.getByText("41%")).toBeTruthy();
  });

  it("keeps its bar green even when full, as only the card shows levels", () => {
    const { container } = render(<T data={{ ...DATA, session: { percent: 100, resetsAt: inMs(60_000) } }} status="ready" />);
    expect(container.querySelector("[data-level]")?.getAttribute("data-level")).toBe("good");
  });

  it("shows a dash before any reading", () => {
    render(<T data={{ session: null, weekly: null, updatedMs: 0 }} status="ready" />);
    expect(screen.getByText("–")).toBeTruthy();
  });
});

describe("Claude Plan Usage tile", () => {
  const T = plan.Tile;

  it("shows Session and Weekly rows", () => {
    render(<T data={DATA} status="ready" />);
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("Weekly")).toBeTruthy();
    expect(screen.getByText("72%")).toBeTruthy();
  });

  it("hides the model row with no data rather than showing a blank", () => {
    const { container } = render(<T data={DATA} status="ready" />);
    expect(container.querySelectorAll(".plan__row").length).toBe(2);
    expect(screen.queryByText("most used")).toBeNull();
  });

  it("is the wide one", () => {
    expect(plan.width).toBe(5.06);
    expect(usage.width).toBe(2.74);
  });
});

describe("card", () => {
  const C = usage.Card!;

  it("lists Session and Weekly with their levels", () => {
    const { container } = render(<C data={DATA} status="ready" />);
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("Weekly")).toBeTruthy();
    const levels = [...container.querySelectorAll("[data-level]")].map((b) => b.getAttribute("data-level"));
    expect(levels).toEqual(["good", "warn"]);
  });

  it("turns full at 90", () => {
    const full = { ...DATA, session: { percent: 90, resetsAt: inMs(60_000) } };
    const { container } = render(<C data={full} status="ready" />);
    expect(container.querySelector("[data-level]")?.getAttribute("data-level")).toBe("full");
  });

  it("offers Disconnect when connected", async () => {
    render(<C data={DATA} status="ready" />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("claude_connect", { on: false }));
  });

  it("explains Connect when not connected", async () => {
    render(<C data={null} status="sample" />);
    expect(screen.getByText(/status line/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("claude_connect", { on: true }));
  });

  it("shows the plain error when connecting fails", async () => {
    mockInvoke.mockRejectedValueOnce("Claude Code isn't installed here.");
    render(<C data={null} status="sample" />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByText("Claude Code isn't installed here.");
  });
});

describe("the sample shown in the picker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the same however long after loading it's drawn", () => {
    vi.useFakeTimers({ now: Date.now() + 40 * 86_400_000 });
    const U = usage.Tile;
    const P = plan.Tile;
    const first = render(<U data={usage.sample ?? null} status="sample" preview />);
    expect(first.getByText("1h 25m")).toBeTruthy();
    first.unmount();
    const second = render(<P data={plan.sample ?? null} status="sample" preview />);
    expect(second.getByText("1h 25m")).toBeTruthy();
  });
});
