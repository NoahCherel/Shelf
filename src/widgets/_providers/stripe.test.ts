import { beforeEach, vi } from "vitest";
import { invoke } from "../../core/tauri";
import { compactMoney, money, shortMoney, stripeProvider, summarize } from "./stripe";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);
const DAY = 86_400;
const NOW = new Date(2026, 9, 11, 15, 0).getTime();
const nowSec = NOW / 1000;

const txn = (ageDays: number, net: number, type = "charge") => ({
  id: `txn_${ageDays}_${net}`,
  type,
  net,
  currency: "usd",
  created: nowSec - ageDays * DAY,
});

describe("summarize", () => {
  it("sums only charges and refunds, net of fees", () => {
    const s = summarize([txn(0, 1000), txn(0, -200, "refund"), txn(0, 5000, "payout"), txn(0, 77, "stripe_fee")], NOW, true);
    expect(s.today).toBe(8);
    expect(s.payments.today).toBe(2);
  });

  it("counts days in local time", () => {
    const justBeforeMidnight = new Date(2026, 9, 10, 23, 59).getTime() / 1000;
    const justAfter = new Date(2026, 9, 11, 0, 1).getTime() / 1000;
    const s = summarize(
      [
        { ...txn(0, 100), created: justBeforeMidnight },
        { ...txn(0, 200), created: justAfter },
      ],
      NOW,
      true,
    );
    expect(s.today).toBe(2);
    expect(s.week).toBe(3);
  });

  it("buckets 7 and 30 days and a 14-day line, oldest first", () => {
    const s = summarize([txn(0, 100), txn(6, 200), txn(7, 400), txn(29, 800), txn(30, 1600)], NOW, true);
    expect(s.week).toBe(3);
    expect(s.month30).toBe(15);
    expect(s.daily.length).toBe(14);
    expect(s.daily[13]).toBe(1);
    expect(s.daily[7]).toBe(2);
    expect(s.daily[6]).toBe(4);
  });

  it("change compares this week to the one before", () => {
    expect(summarize([txn(1, 1310), txn(8, 1000)], NOW, true).change).toBe(31);
    expect(summarize([txn(1, 500), txn(8, 1000)], NOW, true).change).toBe(-50);
  });

  it("change is null with no previous week", () => {
    expect(summarize([txn(1, 500)], NOW, true).change).toBeNull();
  });

  it("zero-decimal currencies aren't divided", () => {
    const s = summarize([{ ...txn(0, 1500), currency: "jpy" }], NOW, true);
    expect(s.today).toBe(1500);
    expect(s.currency).toBe("JPY");
  });

  it("no live mode is flagged as Test mode", () => {
    expect(summarize([], NOW, false).testMode).toBe(true);
    expect(summarize([], NOW, true).testMode).toBe(false);
  });
});

describe("money", () => {
  it("amounts shorten like $1.5k", () => {
    expect(shortMoney(1500, "USD")).toBe("$1.5k");
    expect(shortMoney(12_400, "USD")).toBe("$12.4k");
    expect(shortMoney(2_000_000, "USD")).toBe("$2M");
    expect(shortMoney(980, "USD")).toBe("$980");
  });

  it("full amounts have no cents", () => {
    expect(money(2980, "USD")).toBe("$2,980");
    expect(money(-12, "EUR")).toBe("-€12");
  });

  it("tiles stay whole until they would crowd", () => {
    expect(compactMoney(5336, "USD")).toBe("$5,336");
    expect(compactMoney(15_336, "USD")).toBe("$15.3k");
  });
});

describe("provider", () => {
  const page = (data: unknown[], has_more = false) => ({ status: 200, body: JSON.stringify({ data, has_more }) });
  const balance = (livemode = true) => ({ status: 200, body: JSON.stringify({ livemode }) });

  beforeEach(() => {
  mockInvoke.mockReset();
});

  function serve(pages: (url: string) => { status: number; body: string }) {
    mockInvoke.mockImplementation(async (_cmd, args) => pages((args as { req: { url: string } }).req.url));
  }

  it("refreshes every 5 minutes", () => {
    expect(stripeProvider.intervalMs).toBe(5 * 60_000);
  });

  it("needs setup until a key is saved", async () => {
    mockInvoke.mockResolvedValue(false);
    expect(await stripeProvider.needsSetup!()).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("secret_has", { id: "stripe" });
  });

  it("asks Rust to attach the key, so it's never in the page", async () => {
    serve((url) => (url.includes("/balance?") || url.endsWith("/balance") ? balance() : page([])));
    await stripeProvider.fetch(null);
    const req = (mockInvoke.mock.calls[0][1] as { req: Record<string, unknown> }).req;
    expect(req.secret).toEqual({ id: "stripe", header: "Authorization", prefix: "Bearer " });
    expect(JSON.stringify(mockInvoke.mock.calls)).not.toContain("rk_");
  });

  it("stops at 500 records", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ ...txn(0, 1), id: `t${i}` }));
    serve((url) => (url.includes("balance_transactions") ? page(full, true) : balance()));
    await stripeProvider.fetch(null);
    const calls = mockInvoke.mock.calls.filter((c) => (c[1] as { req: { url: string } }).req.url.includes("balance_transactions"));
    expect(calls.length).toBe(5);
    expect((calls[1][1] as { req: { url: string } }).req.url).toContain("starting_after=t99");
    expect((calls[0][1] as { req: { url: string } }).req.url).toContain("limit=100");
    expect((calls[0][1] as { req: { url: string } }).req.url).toMatch(/created%5Bgte%5D=\d+/);
  });

  it("401 gives rejected", async () => {
    serve(() => ({ status: 401, body: "{}" }));
    await expect(stripeProvider.fetch(null)).rejects.toMatchObject({ kind: "rejected" });
  });

  it("403 gives forbidden with Stripe's message", async () => {
    serve(() => ({ status: 403, body: JSON.stringify({ error: { message: "This key lacks rak_balance_read." } }) }));
    await expect(stripeProvider.fetch(null)).rejects.toMatchObject({
      kind: "forbidden",
      message: expect.stringContaining("This key lacks rak_balance_read."),
    });
  });

  it("network failure gives offline", async () => {
    mockInvoke.mockRejectedValue("offline");
    await expect(stripeProvider.fetch(null)).rejects.toMatchObject({ kind: "offline" });
  });
});
