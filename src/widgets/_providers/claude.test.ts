import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, vi } from "vitest";
import { invoke } from "../../core/tauri";
import { claudeProvider, durationText, pace, resetDayText, toWindow, WEEK_MS, SESSION_MS } from "./claude";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const NOW = 1_000_000_000;

describe("toWindow", () => {
  it("an expired window shows 0% with no time", () => {
    expect(toWindow({ used_percentage: 80, resets_at: NOW / 1000 - 1 }, NOW)).toEqual({ percent: 0, resetsAt: null });
  });

  it("keeps a live window and clamps its percent", () => {
    expect(toWindow({ used_percentage: 41, resets_at: NOW / 1000 + 60 }, NOW)).toEqual({ percent: 41, resetsAt: NOW + 60_000 });
    expect(toWindow({ used_percentage: 140, resets_at: NOW / 1000 + 60 }, NOW)?.percent).toBe(100);
  });

  it("a missing window is null", () => {
    expect(toWindow(undefined, NOW)).toBeNull();
  });
});

describe("pace", () => {
  it("says nothing without a window, without use, or too early", () => {
    expect(pace(null, SESSION_MS, NOW)).toBeNull();
    expect(pace({ percent: 0, resetsAt: NOW + 1000 }, SESSION_MS, NOW)).toBeNull();
    expect(pace({ percent: 10, resetsAt: NOW + SESSION_MS }, SESSION_MS, NOW)).toBeNull();
  });

  it("projects under the limit with no hit time", () => {
    const halfway = { percent: 25, resetsAt: NOW + SESSION_MS / 2 };
    expect(pace(halfway, SESSION_MS, NOW)).toEqual({ projected: 50, hitsLimitAt: null });
  });

  it("gives the time the limit would be hit", () => {
    const halfway = { percent: 80, resetsAt: NOW + SESSION_MS / 2 };
    const result = pace(halfway, SESSION_MS, NOW)!;
    expect(result.projected).toBe(160);
    expect(result.hitsLimitAt).toBe(NOW + (20 * (SESSION_MS / 2)) / 80);
  });
});

describe("text", () => {
  it("durations read like the reference", () => {
    expect(durationText(85 * 60_000)).toBe("1h 25m");
    expect(durationText(5 * 60_000)).toBe("5m");
    expect(durationText(3 * 86_400_000 + 2 * 3_600_000)).toBe("3d 2h");
  });

  it("reset days read day then weekday", () => {
    expect(resetDayText(new Date(2026, 9, 6).getTime())).toBe("6 Tue");
  });

  it("week and session lengths", () => {
    expect(SESSION_MS).toBe(5 * 3_600_000);
    expect(WEEK_MS).toBe(7 * 86_400_000);
  });
});

describe("provider", () => {
  const mockInvoke = vi.mocked(invoke);
  beforeEach(() => mockInvoke.mockReset());

  it("needs setup until connected", async () => {
    mockInvoke.mockResolvedValue({ connected: false, usage: null });
    expect(await claudeProvider.needsSetup!()).toBe(true);
    mockInvoke.mockResolvedValue({ connected: true, usage: null });
    expect(await claudeProvider.needsSetup!()).toBe(false);
  });

  it("connected with nothing reported yet gives empty windows, not an error", async () => {
    mockInvoke.mockResolvedValue({ connected: true, usage: null });
    const data = await claudeProvider.fetch(null);
    expect(data.session).toBeNull();
    expect(data.weekly).toBeNull();
  });

  it("reads both windows", async () => {
    const future = Date.now() / 1000 + 600;
    mockInvoke.mockResolvedValue({
      connected: true,
      usage: { five_hour: { used_percentage: 12, resets_at: future }, seven_day: { used_percentage: 37, resets_at: future } },
    });
    const data = await claudeProvider.fetch(null);
    expect(data.session?.percent).toBe(12);
    expect(data.weekly?.percent).toBe(37);
  });
});

describe("the repo", () => {
  // Built up so this file doesn't match itself. Anthropic's terms keep those tokens for Claude Code.
  const FORBIDDEN = [".credentials", ".json"].join("");

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it("never touches Claude's login file", () => {
    const offenders = [...files("src"), ...files("src-tauri/src")].filter((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .some((line) => line.includes(FORBIDDEN) && !line.trimStart().startsWith("//")),
    );
    expect(offenders).toEqual([]);
  });
});

it("each new minute is a new value, so the countdown on the tile moves", async () => {
  vi.mocked(invoke).mockResolvedValue({ connected: true, usage: null });
  const now = vi.spyOn(Date, "now");
  now.mockReturnValue(60_000);
  const first = await claudeProvider.fetch(null);
  now.mockReturnValue(120_000);
  const second = await claudeProvider.fetch(null);
  now.mockRestore();
  expect(first.updatedMs).not.toBe(second.updatedMs);
});
