import { beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import deepseek from "./index";
import {
  appendSnapshot,
  computeSpend,
  DEEPSEEK_SAMPLE,
  deepseekProvider,
  fetchDeepSeek,
  formatDeepSeekMoney,
  pickBalanceInfo,
} from "../../providers/deepseek";
import { invoke } from "../../core/tauri";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("DeepSeek Balance provider helpers", () => {
  it("picks positive USD balance over zero CNY entry and supports top_up_balance", () => {
    const info = pickBalanceInfo([
      { currency: "CNY", total_balance: "0.00", granted_balance: "0.00", topped_up_balance: "0.00" },
      { currency: "USD", total_balance: "12.50", granted_balance: "2.50", top_up_balance: "10.00" },
    ]);
    expect(info).toEqual({ currency: "USD", total: 12.5, granted: 2.5, toppedUp: 10 });
  });

  it("computes local spend ignoring top-ups and estimates runway", () => {
    const now = new Date(2026, 10, 24, 15, 0, 0).getTime();
    const day = 86_400_000;
    const snaps = [
      { ts: now - 2 * day, balance: 20, currency: "USD" },
      { ts: now - 1 * day, balance: 18, currency: "USD" }, // spent 2
      { ts: now - 12 * 3_600_000, balance: 28, currency: "USD" }, // topped up +10 (ignored)
      { ts: now - 3_600_000, balance: 27.5, currency: "USD" }, // spent 0.5 today
    ];
    const out = computeSpend(snaps, "USD", 27.5, now);
    expect(out.today).toBeCloseTo(0.5, 4);
    expect(out.week).toBeCloseTo(2.5, 4);
    expect(out.daysLeft).toBeGreaterThan(0);
    expect(out.dailySpend).toHaveLength(7);
  });

  it("deduplicates identical snapshots within the same hour", () => {
    const now = 1_800_000_000_000;
    const prev = [{ ts: now - 60_000, balance: 10, currency: "USD" }];
    expect(appendSnapshot(prev, { ts: now, balance: 10, currency: "USD" }, now)).toHaveLength(1);
    expect(appendSnapshot(prev, { ts: now, balance: 9.5, currency: "USD" }, now)).toHaveLength(2);
  });

  it("formats cents cleanly and rejects invalid API keys", async () => {
    expect(formatDeepSeekMoney(0.42, "USD")).toBe("$0.42");
    mockInvoke.mockResolvedValueOnce({ status: 401, body: "{}" });
    await expect(fetchDeepSeek()).rejects.toMatchObject({ kind: "rejected" });
  });

  it("checks secret_has for needsSetup", async () => {
    mockInvoke.mockResolvedValueOnce(false);
    expect(await deepseekProvider.needsSetup!()).toBe(true);
    mockInvoke.mockResolvedValueOnce(true);
    expect(await deepseekProvider.needsSetup!()).toBe(false);
  });
});

describe("DeepSeek Balance widget", () => {
  const T = deepseek.Tile;
  const C = deepseek.Card!;

  it("renders logo and Balance, Today, 7 days rows on the tile", () => {
    const { container } = render(<T data={DEEPSEEK_SAMPLE} status="ready" />);
    expect(container.querySelector(".deepseek-logo")).toBeTruthy();
    expect(screen.getByText("Balance")).toBeTruthy();
    expect(screen.getByText("$14.82")).toBeTruthy();
    expect(screen.getByText("$0.42")).toBeTruthy();
    expect(screen.getByText("$3.15")).toBeTruthy();
    expect(deepseek.width).toBe(4.58);
  });

  it("renders ConnectCard when sample and error card on error", () => {
    const { rerender } = render(<C data={null} status="sample" />);
    expect(screen.getByPlaceholderText("sk-…")).toBeTruthy();

    rerender(<C data={null} status="error" error={{ kind: "rejected", message: "Bad key" }} />);
    expect(screen.getByText("Bad key")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  });

  it("renders balance breakdown, spend and clears history on Disconnect", async () => {
    render(<C data={DEEPSEEK_SAMPLE} status="ready" />);
    expect(screen.getByText("BALANCE")).toBeTruthy();
    expect(screen.getByText("SPEND")).toBeTruthy();
    expect(screen.getByText("~33 days")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    });
    expect(mockInvoke).toHaveBeenCalledWith("secret_delete", { id: "deepseek" });
    expect(mockInvoke).toHaveBeenCalledWith("store_save", { name: "deepseek-history", value: { snapshots: [] } });
  });
});
