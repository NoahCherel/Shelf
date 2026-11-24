import { limitAlerts, limitToast, providerLimitAlerts, providerLimitToast, type Warned } from "./aiLimits";
import type { ClaudeData } from "../providers/claude";

const NOW = new Date(2026, 10, 16, 14, 0).getTime();
const RESET = NOW + 85 * 60_000;
const WEEK_RESET = new Date(2026, 10, 20, 9, 0).getTime();

const data = (session: number | null, weekly: number | null = null, resetsAt = RESET): ClaudeData => ({
  session: session === null ? null : { percent: session, resetsAt },
  weekly: weekly === null ? null : { percent: weekly, resetsAt: WEEK_RESET },
  updatedMs: NOW,
});

/** Feeds readings in order, carrying what was warned, and gives every alert raised. */
function run(readings: ClaudeData[], warned: Warned = {}) {
  const all = [];
  for (const reading of readings) {
    const out = limitAlerts(reading, warned, NOW);
    all.push(...out.alerts);
    warned = out.warned;
  }
  return { alerts: all, warned };
}

it("warns at 80 and again at 95", () => {
  expect(run([data(79)]).alerts).toEqual([]);
  const { alerts } = run([data(79), data(80), data(90), data(95)]);
  expect(alerts).toEqual([
    { window: "session", percent: 80, resetsAt: RESET },
    { window: "session", percent: 95, resetsAt: RESET },
  ]);
});

it("a jump past both steps warns once", () => {
  expect(run([data(70), data(97)]).alerts).toEqual([{ window: "session", percent: 97, resetsAt: RESET }]);
});

it("does not warn twice for the same window", () => {
  expect(run([data(85), data(85), data(88)]).alerts).toHaveLength(1);
});

it("a reset time that drifts a little is the same window", () => {
  expect(run([data(85), data(86, null, RESET + 60_000)]).alerts).toHaveLength(1);
});

it("a window that reset can warn again", () => {
  const first = run([data(85)]);
  const next = limitAlerts(data(82, null, RESET + 5 * 3_600_000), first.warned, NOW);
  expect(next.alerts).toEqual([{ window: "session", percent: 82, resetsAt: RESET + 5 * 3_600_000 }]);
});

it("old values from the cache warn about nothing", () => {
  expect(run([data(90, null, NOW - 1)]).alerts).toEqual([]);
});

it("session and weekly are watched apart", () => {
  const { alerts } = run([data(50, 81), data(82, 83)]);
  expect(alerts.map((a) => a.window)).toEqual(["weekly", "session"]);
});

it("words the toast for each window", () => {
  const session = limitToast({ window: "session", percent: 80.4, resetsAt: RESET }, NOW, "claude-usage");
  expect(session).toEqual({
    id: "ai-limit-session",
    title: "Claude session at 80%",
    body: "Resets in 1h 25m.",
    sound: true,
    expiresAt: RESET,
    action: { label: "Details", target: "widget:claude-usage" },
  });
  const weekly = limitToast({ window: "weekly", percent: 95, resetsAt: WEEK_RESET }, NOW, "claude-plan-usage");
  expect(weekly.title).toBe("Claude weekly limit at 95%");
  expect(weekly.body).toBe("Resets 20 Fri.");
  expect(weekly.id).toBe("ai-limit-weekly");
});

it("no details button without a Claude widget", () => {
  expect(limitToast({ window: "session", percent: 80, resetsAt: RESET }, NOW, null).action).toBeUndefined();
});

it("handles ChatGPT and Gemini provider alerts with distinct keys", () => {
  const out = providerLimitAlerts(
    "ChatGPT",
    [
      { key: "chatgpt-session", label: "session", win: { percent: 84, resetsAt: RESET } },
      { key: "chatgpt-weekly", label: "weekly limit", win: { percent: 40, resetsAt: WEEK_RESET }, dayReset: true },
    ],
    {},
    NOW,
  );
  expect(out.alerts).toHaveLength(1);
  expect(providerLimitToast(out.alerts[0], NOW, "chatgpt-usage")).toMatchObject({
    id: "ai-limit-chatgpt-session",
    title: "ChatGPT session at 84%",
    action: { label: "Details", target: "widget:chatgpt-usage" },
  });
});
