// Warns before an AI limit runs out (F-077): at 80% of a window, and again at 95% (G-13).
import { durationText, resetDayText, type ClaudeData, type LimitWindow } from "../providers/claude";
import type { Toast } from "../core/toast";

export const LIMIT_STEPS = [80, 95];

type LimitName = "session" | "weekly";
const LIMITS: LimitName[] = ["session", "weekly"];

/** The highest step already warned about, per window key, and which window that was. */
export type Warned = Record<string, { resetsAt: number; step: number } | undefined>;

export interface LimitAlert {
  window: LimitName;
  percent: number;
  resetsAt: number;
}

export interface ProviderLimitWindow {
  /** Stable key stored in `Warned` and used in the toast id. */
  key: string;
  label: string;
  win: LimitWindow | null;
  dayReset?: boolean;
}

export interface ProviderLimitAlert {
  key: string;
  provider: string;
  label: string;
  percent: number;
  resetsAt: number;
  dayReset?: boolean;
}

/**
 * Providers report a window's reset time on each reading, and it may move by a little. A new window
 * starts only after the old one has reset, so it resets hours later: anything
 * closer than an hour is the same window.
 */
const SAME_WINDOW_MS = 3_600_000;

/** What to warn about now, and what is then known to be warned. A window that already reset is skipped: the cache can hold yesterday's values. */
export function limitAlerts(data: ClaudeData, warned: Warned, now: number): { alerts: LimitAlert[]; warned: Warned } {
  const next: Warned = { ...warned };
  const alerts: LimitAlert[] = [];
  for (const name of LIMITS) {
    const win = data[name];
    if (!win?.resetsAt || win.resetsAt <= now) continue;
    const known = next[name];
    const same = known !== undefined && Math.abs(win.resetsAt - known.resetsAt) < SAME_WINDOW_MS;
    const step = Math.max(0, ...LIMIT_STEPS.filter((s) => win.percent >= s));
    if (step === 0 || (same && step <= known.step)) continue;
    alerts.push({ window: name, percent: win.percent, resetsAt: win.resetsAt });
    next[name] = { resetsAt: win.resetsAt, step };
  }
  return { alerts, warned: next };
}

/** `details` is the Claude widget on the dock whose card the toast's button opens, or null for no button. */
export function limitToast(alert: LimitAlert, now: number, details: string | null): Toast {
  const percent = Math.round(alert.percent);
  const session = alert.window === "session";
  return {
    id: `ai-limit-${alert.window}`,
    title: session ? `Claude session at ${percent}%` : `Claude weekly limit at ${percent}%`,
    body: session ? `Resets in ${durationText(alert.resetsAt - now)}.` : `Resets ${resetDayText(alert.resetsAt)}.`,
    sound: true,
    // Held through quiet hours past the reset, it would no longer be true.
    expiresAt: alert.resetsAt,
    ...(details ? { action: { label: "Details", target: `widget:${details}` } } : {}),
  };
}

/** Generic 80% / 95% alert check for additional AI providers (ChatGPT, Gemini, …). */
export function providerLimitAlerts(
  provider: string,
  windows: ProviderLimitWindow[],
  warned: Warned,
  now: number,
): { alerts: ProviderLimitAlert[]; warned: Warned } {
  const next: Warned = { ...warned };
  const alerts: ProviderLimitAlert[] = [];
  for (const item of windows) {
    const win = item.win;
    if (!win?.resetsAt || win.resetsAt <= now) continue;
    const known = next[item.key];
    const same = known !== undefined && Math.abs(win.resetsAt - known.resetsAt) < SAME_WINDOW_MS;
    const step = Math.max(0, ...LIMIT_STEPS.filter((s) => win.percent >= s));
    if (step === 0 || (same && step <= known.step)) continue;
    alerts.push({ key: item.key, provider, label: item.label, percent: win.percent, resetsAt: win.resetsAt, dayReset: item.dayReset });
    next[item.key] = { resetsAt: win.resetsAt, step };
  }
  return { alerts, warned: next };
}

export function providerLimitToast(alert: ProviderLimitAlert, now: number, details: string | null): Toast {
  const percent = Math.round(alert.percent);
  return {
    id: `ai-limit-${alert.key}`,
    title: `${alert.provider} ${alert.label} at ${percent}%`,
    body: alert.dayReset ? `Resets ${resetDayText(alert.resetsAt)}.` : `Resets in ${durationText(alert.resetsAt - now)}.`,
    sound: true,
    expiresAt: alert.resetsAt,
    ...(details ? { action: { label: "Details", target: `widget:${details}` } } : {}),
  };
}
