import { beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import grok from "./index";
import { GROK_SAMPLE, grokProvider } from "../../providers/grok";
import { invoke } from "../../core/tauri";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("Grok Usage widget", () => {
  const T = grok.Tile;
  const C = grok.Card!;

  it("renders logo, Credits row and percent on the tile", () => {
    const { container } = render(<T data={GROK_SAMPLE} status="ready" />);
    expect(container.querySelector(".grok-logo")).toBeTruthy();
    expect(screen.getByText("Credits")).toBeTruthy();
    expect(screen.getByText("34%")).toBeTruthy();
    expect(grok.width).toBe(4.58);
  });

  it("shows Check again when not connected and Refresh when ready", () => {
    const { rerender } = render(<C data={null} status="sample" />);
    expect(screen.getByText(/Grok CLI/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();

    rerender(<C data={GROK_SAMPLE} status="ready" />);
    expect(screen.getByText("SuperGrok")).toBeTruthy();
    expect(screen.getByText("TREND")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(mockInvoke).toHaveBeenCalledWith("grok_usage", { force: true });
  });

  it("provider maps grok_usage payload", async () => {
    const future = Date.now() / 1000 + 86_400;
    mockInvoke.mockResolvedValue({
      connected: true,
      plan: "SuperGrok",
      usage: { credits: { used_percentage: 41, resets_at: future } },
      history: [20, 41],
    });
    expect(await grokProvider.needsSetup!()).toBe(false);
    const out = await grokProvider.fetch(null);
    expect(out.plan).toBe("SuperGrok");
    expect(out.credits?.percent).toBe(41);
    expect(out.history).toEqual([20, 41]);

    // When resets_at is 0 (unknown), percent must NOT be wiped to 0.
    mockInvoke.mockResolvedValue({
      connected: true,
      plan: "SuperGrok",
      usage: { credits: { used_percentage: 58, resets_at: 0 } },
      history: [],
    });
    const noReset = await grokProvider.fetch(null);
    expect(noReset.credits).toEqual({ percent: 58, resetsAt: null });
  });
});
