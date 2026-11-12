// Limits come only from what Claude Code hands its status line. Claude's own login
// is never read: Anthropic's terms keep those tokens for Claude Code and its apps.
import { invoke } from "../core/tauri";
import type { Provider } from "../core/widget";

export const SESSION_MS = 5 * 3_600_000;
export const WEEK_MS = 7 * 86_400_000;

export interface LimitWindow {
  percent: number;
  resetsAt: number | null;
}

export interface ClaudeData {
  session: LimitWindow | null;
  weekly: LimitWindow | null;
  updatedMs: number;
}

/** Counts from whenever it's drawn, so the same text shows however long ago this code loaded. */
export const CLAUDE_SAMPLE: ClaudeData = {
  session: {
    percent: 100,
    get resetsAt() {
      return Date.now() + 85 * 60_000;
    },
  },
  weekly: {
    percent: 37,
    get resetsAt() {
      return Date.now() + 4 * 86_400_000;
    },
  },
  updatedMs: 0,
};

interface RawWindow {
  used_percentage: number;
  resets_at: number;
}

interface RawUsage {
  connected: boolean;
  usage: { five_hour?: RawWindow; seven_day?: RawWindow } | null;
}

/** A window that has already reset starts again from zero, even if Claude Code hasn't run since to report it. */
export function toWindow(raw: RawWindow | undefined, now: number): LimitWindow | null {
  if (!raw) return null;
  const resetsAt = raw.resets_at * 1000;
  if (resetsAt <= now) return { percent: 0, resetsAt: null };
  return { percent: Math.min(100, Math.max(0, raw.used_percentage)), resetsAt };
}

/** Straight-line projection. Null early in a window, when there's too little to go on. */
export function pace(win: LimitWindow | null, lengthMs: number, now: number) {
  if (!win?.resetsAt || win.percent <= 0) return null;
  const elapsed = lengthMs - (win.resetsAt - now);
  if (elapsed < lengthMs * 0.05) return null;
  const projected = (win.percent * lengthMs) / elapsed;
  if (projected < 100) return { projected, hitsLimitAt: null };
  return { projected, hitsLimitAt: now + ((100 - win.percent) * elapsed) / win.percent };
}

export function durationText(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function resetDayText(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${d.toLocaleDateString("en-GB", { weekday: "short" })}`;
}

export const claudeProvider: Provider<ClaudeData> = {
  id: "claude",
  intervalMs: 30_000,
  needsSetup: async () => !(await invoke<RawUsage>("claude_usage")).connected,
  fetch: async () => {
    const { usage } = await invoke<RawUsage>("claude_usage");
    const now = Date.now();
    return { session: toWindow(usage?.five_hour, now), weekly: toWindow(usage?.seven_day, now), updatedMs: Math.floor(now / 60_000) * 60_000 };
  },
};
