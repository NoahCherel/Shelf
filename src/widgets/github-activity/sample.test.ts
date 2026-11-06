import { afterEach, vi } from "vitest";
import activity from "./index";
import { contributionStats, type GithubData } from "../_providers/github";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

afterEach(() => {
  vi.useRealTimers();
});

it("the sample ends today however long after loading it's drawn", () => {
  vi.useFakeTimers({ now: Date.now() + 40 * 86_400_000 });
  const days = (activity.sample as GithubData).days;
  expect(contributionStats(days)).toEqual({ today: 2, week: 12, streak: 1 });
  expect(activity.sample).toBe(activity.sample);
});
