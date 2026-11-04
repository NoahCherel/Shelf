import { beforeEach, vi } from "vitest";
import { invoke } from "../../core/tauri";
import { defaults, useSettings } from "../../core/settings";
import { contributionStats, fetchContributions, githubProvider, gridCells, parseContributions, GRID_DAYS } from "./github";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);

// The shape of the real page.
const PAGE = `
<table>
<td tabindex="0" data-ix="0" aria-selected="false" style="width:10px" data-date="2026-10-09" id="contribution-day-component-0-0" data-level="0" role="gridcell"></td>
<tool-tip id="tooltip-a" for="contribution-day-component-0-0" popover="manual" data-direction="n">No contributions on October 9th.</tool-tip>
<td data-date="2026-10-11" id="contribution-day-component-0-2" data-level="3"></td>
<tool-tip id="tooltip-c" for="contribution-day-component-0-2">1,204 contributions on October 11th.</tool-tip>
<td data-date="2026-10-10" id="contribution-day-component-0-1" data-level="1"></td>
<tool-tip id="tooltip-b" for="contribution-day-component-0-1">2 contributions on October 10th.</tool-tip>
</table>`;

beforeEach(() => {
  mockInvoke.mockReset();
  useSettings.setState({ ...defaults(), github: { user: "octocat" } });
});

describe("parseContributions", () => {
  it("reads the real page's shape, sorted by date, with counts over a thousand", () => {
    expect(parseContributions(PAGE)).toEqual([
      { date: "2026-10-09", level: 0, count: 0 },
      { date: "2026-10-10", level: 1, count: 2 },
      { date: "2026-10-11", level: 3, count: 1204 },
    ]);
  });

  it("gives nothing for a page without a calendar", () => {
    expect(parseContributions("<html>sorry</html>")).toEqual([]);
  });
});

describe("contributionStats", () => {
  const day = (date: string, count: number) => ({ date, level: count ? 1 : 0, count });

  it("counts today, the week and the streak", () => {
    const days = [day("2026-10-01", 9), day("2026-10-09", 0), day("2026-10-10", 2), day("2026-10-11", 3)];
    expect(contributionStats(days, "2026-10-11")).toEqual({ today: 3, week: 14, streak: 2 });
  });

  it("a quiet today doesn't break the streak until it's over", () => {
    const days = [day("2026-10-09", 1), day("2026-10-10", 2), day("2026-10-11", 0)];
    expect(contributionStats(days, "2026-10-11")).toEqual({ today: 0, week: 3, streak: 2 });
  });

  it("ignores days after today, as GitHub's timezone can run ahead", () => {
    const days = [day("2026-10-11", 1), day("2026-10-12", 5)];
    expect(contributionStats(days, "2026-10-11").today).toBe(1);
  });
});

describe("gridCells", () => {
  it("is 13 columns of 3, newest last, padded at the start", () => {
    expect(GRID_DAYS).toBe(39);
    const cells = gridCells([{ date: "2026-10-11", level: 4, count: 9 }], "2026-10-11");
    expect(cells.length).toBe(39);
    expect(cells[0].level).toBe(0);
    expect(cells[38].level).toBe(4);
  });
});

describe("provider", () => {
  it("needs setup without a user", async () => {
    useSettings.setState({ github: { user: " " } });
    expect(await githubProvider.needsSetup!()).toBe(true);
  });

  it("refreshes every 30 minutes", () => {
    expect(githubProvider.intervalMs).toBe(30 * 60_000);
  });

  it("escapes the user name in the URL", async () => {
    mockInvoke.mockResolvedValue({ status: 200, body: PAGE });
    await fetchContributions("a/b");
    expect(mockInvoke).toHaveBeenCalledWith("http_get", { req: { url: "https://github.com/users/a%2Fb/contributions" } });
  });

  it("an unknown user is a plain notfound", async () => {
    mockInvoke.mockResolvedValue({ status: 404, body: "" });
    await expect(fetchContributions("nobody")).rejects.toMatchObject({ kind: "notfound", message: expect.stringContaining("nobody") });
  });

  it("a network failure is offline", async () => {
    mockInvoke.mockRejectedValue("offline");
    await expect(fetchContributions("octocat")).rejects.toMatchObject({ kind: "offline" });
  });
});
