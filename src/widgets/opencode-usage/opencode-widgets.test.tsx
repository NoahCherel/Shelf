import { beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import opencode from "./index";
import opencodePlan from "../opencode-plan-usage/index";
import { OPENCODE_SAMPLE, opencodeProvider } from "../../providers/opencode";
import { invoke } from "../../core/tauri";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("OpenCode widgets", () => {
  it("renders compact token tile for OpenCode Usage (W-008)", () => {
    const T = opencode.Tile;
    const { container } = render(<T data={OPENCODE_SAMPLE} status="ready" />);
    expect(container.querySelector(".opencode-logo")).toBeTruthy();
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("last 5h")).toBeTruthy();
    expect(screen.getByText("185k")).toBeTruthy();
    expect(opencode.width).toBe(2.83);
  });

  it("renders plan gauge tile with Session, Weekly and top model (W-009)", () => {
    const T = opencodePlan.Tile;
    const { container } = render(<T data={OPENCODE_SAMPLE} status="ready" />);
    expect(container.querySelector(".opencode-logo")).toBeTruthy();
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("Weekly")).toBeTruthy();
    expect(screen.getByText("claude-sonnet-4.5")).toBeTruthy();
    expect(screen.getByText("most used")).toBeTruthy();
    // Always uses level="good" to avoid false red alerts without fixed caps.
    const levels = [...container.querySelectorAll("[data-level]")].map((b) => b.getAttribute("data-level"));
    expect(levels).toEqual(["good", "good"]);
    expect(opencodePlan.width).toBe(4.53);
  });

  it("renders shared OpenCodeCard for sample and ready states", () => {
    const C = opencode.Card!;
    const { rerender } = render(<C data={null} status="sample" />);
    expect(screen.getByText(/offline/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();

    rerender(<C data={OPENCODE_SAMPLE} status="ready" />);
    expect(screen.getByText("Offline")).toBeTruthy();
    expect(screen.getByText("SESSION (5H)")).toBeTruthy();
    expect(screen.getByText("WEEKLY (7D)")).toBeTruthy();
    expect(screen.getByText("$0.64")).toBeTruthy();
    expect(screen.getByText("$4.82")).toBeTruthy();
  });

  it("provider maps local rust opencode_usage payload", async () => {
    mockInvoke.mockResolvedValue({
      connected: true,
      session: { tokens: 12_000, input: 8_000, output: 2_000, cache: 2_000, cost: 0.08, messages: 4 },
      weekly: { tokens: 45_000, input: 30_000, output: 10_000, cache: 5_000, cost: 0.31, messages: 15 },
      top_model: { name: "gpt-5", tokens: 45_000, cost: 0.31 },
      models: [{ name: "gpt-5", tokens: 45_000, cost: 0.31 }],
      daily_tokens: [0, 0, 0, 10_000, 15_000, 8_000, 12_000],
    });
    expect(await opencodeProvider.needsSetup!()).toBe(false);
    const out = await opencodeProvider.fetch(null);
    expect(out.session.tokens).toBe(12_000);
    expect(out.topModel?.name).toBe("gpt-5");
  });
});
