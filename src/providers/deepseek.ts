// DeepSeek API balance (GET /user/balance with a DPAPI-stored sk- key)
// plus local spend tracking derived from balance deltas over time.
import { STORE } from "../core/names";
import { invoke } from "../core/tauri";
import type { Provider, ProviderError } from "../core/widget";
import { httpGet } from "./http";

export const DEEPSEEK_SECRET = "deepseek";

const API_URL = "https://api.deepseek.com/user/balance";
const AUTH = { id: DEEPSEEK_SECRET, header: "Authorization", prefix: "Bearer " };
const DAY_MS = 86_400_000;
const KEEP_DAYS = 30;
const SPARK_DAYS = 7;

export interface BalanceSnapshot {
  ts: number;
  balance: number;
  currency: string;
}

export interface DeepSeekHistoryStore {
  snapshots: BalanceSnapshot[];
}

export interface DeepSeekData {
  currency: string;
  isAvailable: boolean;
  total: number;
  granted: number;
  toppedUp: number;
  today: number;
  week: number;
  daysLeft: number | null;
  dailySpend: number[];
  trackingSamples: number;
}

interface RawBalanceInfo {
  currency?: string;
  total_balance?: string | number;
  granted_balance?: string | number;
  topped_up_balance?: string | number;
  top_up_balance?: string | number;
}

interface RawBalanceResponse {
  is_available?: boolean;
  balance_infos?: RawBalanceInfo[];
}

export const DEEPSEEK_SAMPLE: DeepSeekData = {
  currency: "USD",
  isAvailable: true,
  total: 14.82,
  granted: 0,
  toppedUp: 14.82,
  today: 0.42,
  week: 3.15,
  daysLeft: 33,
  dailySpend: [0.35, 0.52, 0.28, 0.61, 0.44, 0.53, 0.42],
  trackingSamples: 12,
};

export function formatDeepSeekMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || "USD"}`;
  }
}

function toNum(v: string | number | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function localMidnightMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function pickBalanceInfo(infos: RawBalanceInfo[] | undefined): {
  currency: string;
  total: number;
  granted: number;
  toppedUp: number;
} {
  const list = infos ?? [];
  if (list.length === 0) return { currency: "USD", total: 0, granted: 0, toppedUp: 0 };
  const positive = list.filter((i) => toNum(i.total_balance) > 0);
  const chosen =
    positive.find((i) => (i.currency ?? "").toUpperCase() === "USD") ??
    positive[0] ??
    list.find((i) => (i.currency ?? "").toUpperCase() === "USD") ??
    list[0];
  return {
    currency: (chosen.currency ?? "USD").toUpperCase(),
    total: toNum(chosen.total_balance),
    granted: toNum(chosen.granted_balance),
    toppedUp: toNum(chosen.topped_up_balance ?? chosen.top_up_balance),
  };
}

export function appendSnapshot(
  prev: BalanceSnapshot[],
  current: BalanceSnapshot,
  nowMs: number,
): BalanceSnapshot[] {
  const cutoff = nowMs - KEEP_DAYS * DAY_MS;
  const kept = prev.filter((s) => s.ts >= cutoff && Number.isFinite(s.balance));
  const last = kept[kept.length - 1];
  const sameValue =
    last &&
    last.currency === current.currency &&
    Math.abs(last.balance - current.balance) < 0.0001 &&
    nowMs - last.ts < 3_600_000;
  if (sameValue) return kept;
  return [...kept, current];
}

export function computeSpend(
  snapshots: BalanceSnapshot[],
  currency: string,
  currentBalance: number,
  nowMs: number,
): { today: number; week: number; daysLeft: number | null; dailySpend: number[] } {
  const filtered = snapshots
    .filter((s) => s.currency === currency)
    .sort((a, b) => a.ts - b.ts);
  const midnight = localMidnightMs(nowMs);
  const weekCutoff = midnight - (SPARK_DAYS - 1) * DAY_MS;

  let today = 0;
  let week = 0;
  const daily = new Array<number>(SPARK_DAYS).fill(0);

  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1];
    const curr = filtered[i];
    const delta = prev.balance - curr.balance;
    // Top-ups (negative delta) are not spend.
    if (delta <= 0) continue;
    if (curr.ts >= midnight) today += delta;
    if (curr.ts >= weekCutoff) {
      week += delta;
      const dayMidnight = localMidnightMs(curr.ts);
      const daysAgo = Math.round((midnight - dayMidnight) / DAY_MS);
      if (daysAgo >= 0 && daysAgo < SPARK_DAYS) {
        daily[SPARK_DAYS - 1 - daysAgo] += delta;
      }
    }
  }

  let daysLeft: number | null = null;
  if (week > 0 && filtered.length >= 2) {
    const spanMs = Math.max(DAY_MS, Math.min(SPARK_DAYS * DAY_MS, nowMs - filtered[0].ts));
    const avgPerDay = week / (spanMs / DAY_MS);
    if (avgPerDay > 0) {
      daysLeft = Math.max(0, Math.round(currentBalance / avgPerDay));
    }
  }

  return {
    today: Math.round(today * 10_000) / 10_000,
    week: Math.round(week * 10_000) / 10_000,
    daysLeft,
    dailySpend: daily.map((v) => Math.round(v * 10_000) / 10_000),
  };
}

export async function clearDeepSeekHistory(): Promise<void> {
  await invoke("store_save", { name: STORE.deepseekHistory, value: { snapshots: [] } }).catch(() => {});
}

export async function fetchDeepSeek(): Promise<DeepSeekData> {
  const res = await httpGet({ url: API_URL, headers: { Accept: "application/json" }, secret: AUTH });
  if (res.status === 401) {
    throw { kind: "rejected", message: "DeepSeek didn't accept this API key. Check it and connect again." } satisfies ProviderError;
  }
  if (res.status === 402 || res.status === 403) {
    throw { kind: "forbidden", message: "DeepSeek accepted the key, but balance access isn't allowed." } satisfies ProviderError;
  }
  if (res.status >= 400) {
    throw { kind: "other", message: `DeepSeek answered with an error (${res.status}).` } satisfies ProviderError;
  }

  let parsed: RawBalanceResponse;
  try {
    parsed = JSON.parse(res.body) as RawBalanceResponse;
  } catch {
    throw { kind: "other", message: "DeepSeek returned an unexpected response." } satisfies ProviderError;
  }

  const info = pickBalanceInfo(parsed.balance_infos);
  const now = Date.now();
  const saved = (await invoke<DeepSeekHistoryStore | null>("store_load", { name: STORE.deepseekHistory }).catch(() => null)) ?? {
    snapshots: [],
  };
  const nextSnapshots = appendSnapshot(
    Array.isArray(saved.snapshots) ? saved.snapshots : [],
    { ts: now, balance: info.total, currency: info.currency },
    now,
  );
  await invoke("store_save", { name: STORE.deepseekHistory, value: { snapshots: nextSnapshots } }).catch(() => {});

  const spend = computeSpend(nextSnapshots, info.currency, info.total, now);
  return {
    currency: info.currency,
    isAvailable: parsed.is_available !== false,
    total: info.total,
    granted: info.granted,
    toppedUp: info.toppedUp,
    today: spend.today,
    week: spend.week,
    daysLeft: spend.daysLeft,
    dailySpend: spend.dailySpend,
    trackingSamples: nextSnapshots.length,
  };
}

export const deepseekProvider: Provider<DeepSeekData> = {
  id: "deepseek",
  intervalMs: 60_000,
  needsSetup: async () => !(await invoke<boolean>("secret_has", { id: DEEPSEEK_SECRET })),
  fetch: fetchDeepSeek,
};
