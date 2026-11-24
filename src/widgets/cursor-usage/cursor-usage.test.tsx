import { beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import cursor from "./index";
import { CURSOR_SAMPLE, cursorProvider } from "../../providers/cursor";
import { invoke } from "../../core/tauri";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("Cursor Usage widget", () => {
  const T = cursor.Tile;
  const C = cursor.Card!;

  it("renders logo, Auto and API rows on the tile", () => {
    const { container } = render(<T data={CURSOR_SAMPLE} status="ready" />);
    expect(container.querySelector(".cursor-logo")).toBeTruthy();
    expect(screen.getByText("Auto")).toBeTruthy();
    expect(screen.getByText("API")).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("18%")).toBeTruthy();
    expect(cursor.width).toBe(4.58);
  });

  it("shows Check again when not connected and billing details when ready", () => {
    const { rerender } = render(<C data={null} status="sample" />);
    expect(screen.getByText(/local sign-in/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();

    rerender(<C data={CURSOR_SAMPLE} status="ready" />);
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.getByText("BILLING")).toBeTruthy();
    expect(screen.getByText("$3.50")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(mockInvoke).toHaveBeenCalledWith("cursor_usage", { force: true });
  });

  it("provider maps cursor_usage payload", async () => {
    const future = Date.now() / 1000 + 86_400;
    mockInvoke.mockResolvedValue({
      connected: true,
      plan: "Pro",
      usage: {
        auto: { used_percentage: 55, resets_at: future },
        api: { used_percentage: 22, resets_at: future },
        on_demand_cents: 499,
        renewal_at: future,
      },
      history: [30, 55],
    });
    expect(await cursorProvider.needsSetup!()).toBe(false);
    const out = await cursorProvider.fetch(null);
    expect(out.plan).toBe("Pro");
    expect(out.auto?.percent).toBe(55);
    expect(out.api?.percent).toBe(22);
    expect(out.onDemandCents).toBe(499);
    expect(out.history).toEqual([30, 55]);

    // When resets_at is 0 (unknown), percent must NOT be wiped to 0.
    mockInvoke.mockResolvedValue({
      connected: true,
      plan: "Pro",
      usage: { auto: { used_percentage: 64, resets_at: 0 }, api: null },
      history: [],
    });
    const noReset = await cursorProvider.fetch(null);
    expect(noReset.auto).toEqual({ percent: 64, resetsAt: null });
  });
});
