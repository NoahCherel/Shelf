import { runNow } from "../../core/provider";
import { useSettings } from "../../core/settings";
import type { Provider, ProviderError } from "../../core/widget";
import { httpGet } from "./http";

export interface ContributionDay {
  date: string;
  level: number;
  count: number;
}

export interface GithubData {
  days: ContributionDay[];
}

export const GRID_DAYS = 39; // 13 columns of 3

/** The public contribution calendar: per-day counts, with no token needed. Private work only counts if the profile shows it. */
export function parseContributions(html: string): ContributionDay[] {
  const counts = new Map<string, number>();
  for (const [, id, text] of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)</g)) {
    const match = /^([\d,]+) contribution/.exec(text.trim());
    counts.set(id, match ? Number(match[1].replace(/,/g, "")) : 0);
  }
  const days: ContributionDay[] = [];
  for (const [tag] of html.matchAll(/<td\b[^>]*\bdata-date="[^"]+"[^>]*>/g)) {
    const date = /data-date="([\d-]+)"/.exec(tag)?.[1];
    const id = /\bid="([^"]+)"/.exec(tag)?.[1] ?? "";
    const level = Number(/data-level="(\d)"/.exec(tag)?.[1] ?? 0);
    if (date) days.push({ date, level, count: counts.get(id) ?? 0 });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

export function localDateKey(ms = Date.now()): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A day with nothing yet doesn't break the streak until it's over. */
export function contributionStats(days: ContributionDay[], today = localDateKey()) {
  const past = days.filter((d) => d.date <= today);
  const last = past[past.length - 1];
  let streak = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i].count > 0) streak++;
    else if (past[i].date !== today) break;
  }
  return {
    today: last?.date === today ? last.count : 0,
    week: past.slice(-7).reduce((sum, d) => sum + d.count, 0),
    streak,
  };
}

export function gridCells(days: ContributionDay[], today = localDateKey()): ContributionDay[] {
  const recent = days.filter((d) => d.date <= today).slice(-GRID_DAYS);
  const blank: ContributionDay = { date: "", level: 0, count: 0 };
  return [...Array<ContributionDay>(Math.max(0, GRID_DAYS - recent.length)).fill(blank), ...recent];
}

/** Doubles as the connect check: one real read. */
export async function fetchContributions(user: string): Promise<GithubData> {
  const res = await httpGet({ url: `https://github.com/users/${encodeURIComponent(user)}/contributions` });
  if (res.status === 404) throw { kind: "notfound", message: `GitHub doesn't know a user called "${user}".` } satisfies ProviderError;
  if (res.status >= 400) throw { kind: "other", message: `GitHub answered with an error (${res.status}).` } satisfies ProviderError;
  // A year of days is more than any tile shows; the streak is what needs the depth.
  return { days: parseContributions(res.body) };
}

const currentUser = () => useSettings.getState().github.user.trim();

export const githubProvider: Provider<GithubData> = {
  id: "github",
  intervalMs: 30 * 60_000,
  needsSetup: async () => !currentUser(),
  fetch: () => fetchContributions(currentUser()),
};

// A different account, here or in another window, needs new data straight away.
useSettings.subscribe((now, before) => {
  if (now.github.user !== before.github.user) runNow(githubProvider);
});
