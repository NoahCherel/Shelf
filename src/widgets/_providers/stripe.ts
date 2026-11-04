import { invoke } from "../../core/tauri";
import type { Provider, ProviderError } from "../../core/widget";
import { httpGet, type HttpRequest, type HttpResponse } from "./http";

export const STRIPE_SECRET = "stripe";

const MAX_RECORDS = 500;
const PAGE_SIZE = 100;
const DAY_SECONDS = 86_400;
const LINE_DAYS = 14;
const API = "https://api.stripe.com/v1";
const AUTH = { id: STRIPE_SECRET, header: "Authorization", prefix: "Bearer " };

export interface StripeData {
  currency: string;
  today: number;
  week: number;
  month30: number;
  /** Net per day, oldest first. */
  daily: number[];
  /** This week against the one before, in percent. */
  change: number | null;
  testMode: boolean;
  payments: { today: number; week: number; month30: number };
}

export interface BalanceTransaction {
  id: string;
  type: string;
  net: number;
  currency: string;
  created: number;
}

function minorUnitDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function localMidnight(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole local days between a time and today; 0 is today. Survives clock changes. */
function daysAgo(createdSec: number, midnight: Date): number {
  const then = localMidnight(createdSec * 1000);
  return Math.round((midnight.getTime() - then.getTime()) / (DAY_SECONDS * 1000));
}

export function summarize(records: BalanceTransaction[], nowMs: number, livemode: boolean): StripeData {
  const counted = records.filter((r) => r.type === "charge" || r.type === "refund");
  const currency = (counted[0]?.currency ?? "usd").toUpperCase();
  const unit = 10 ** minorUnitDigits(currency);
  const midnight = localMidnight(nowMs);

  const dayTotals = new Map<number, number>();
  const dayCounts = new Map<number, number>();
  for (const r of counted) {
    const age = daysAgo(r.created, midnight);
    dayTotals.set(age, (dayTotals.get(age) ?? 0) + r.net);
    dayCounts.set(age, (dayCounts.get(age) ?? 0) + 1);
  }
  const sum = (map: Map<number, number>, from: number, to: number) => {
    let total = 0;
    for (const [age, value] of map) if (age >= from && age < to) total += value;
    return total;
  };
  const amount = (from: number, to: number) => sum(dayTotals, from, to) / unit;

  const week = amount(0, 7);
  const before = amount(7, 14);
  return {
    currency,
    today: amount(0, 1),
    week,
    month30: amount(0, 30),
    daily: Array.from({ length: LINE_DAYS }, (_, i) => (dayTotals.get(LINE_DAYS - 1 - i) ?? 0) / unit),
    change: before > 0 ? Math.round(((week - before) / before) * 100) : null,
    testMode: !livemode,
    payments: { today: sum(dayCounts, 0, 1), week: sum(dayCounts, 0, 7), month30: sum(dayCounts, 0, 30) },
  };
}

function currencySymbol(currency: string): string {
  const parts = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? "";
}

export function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function shortMoney(amount: number, currency: string): string {
  const size = Math.abs(amount);
  if (size < 1000) return money(amount, currency);
  const [value, suffix] = size >= 1_000_000 ? [amount / 1_000_000, "M"] : [amount / 1000, "k"];
  return `${currencySymbol(currency)}${+value.toFixed(1)}${suffix}`;
}

/** Whole amounts until they'd crowd the tile. */
export function compactMoney(amount: number, currency: string): string {
  return Math.abs(amount) < 10_000 ? money(amount, currency) : shortMoney(amount, currency);
}

function stripeMessage(res: HttpResponse): string | undefined {
  try {
    return (JSON.parse(res.body) as { error?: { message?: string } }).error?.message;
  } catch {
    return undefined;
  }
}

async function get(req: HttpRequest): Promise<HttpResponse> {
  const res = await httpGet({ ...req, secret: AUTH });
  if (res.status === 401) {
    throw { kind: "rejected", message: "Stripe didn't accept this key. Check it and connect again." } satisfies ProviderError;
  }
  if (res.status === 403) {
    const reason = stripeMessage(res);
    throw {
      kind: "forbidden",
      message: `Stripe accepted the key but it isn't allowed to read this.${reason ? ` ${reason}` : ""}`,
    } satisfies ProviderError;
  }
  if (res.status >= 400) throw { kind: "other", message: stripeMessage(res) ?? `Stripe answered with an error (${res.status}).` } satisfies ProviderError;
  return res;
}

export async function fetchStripe(): Promise<StripeData> {
  const now = Date.now();
  // The key itself never comes back to the page, so Stripe says whether it's a test key.
  const { livemode } = JSON.parse((await get({ url: `${API}/balance` })).body) as { livemode: boolean };
  const since = Math.floor(localMidnight(now).getTime() / 1000) - 29 * DAY_SECONDS;
  const records: BalanceTransaction[] = [];
  let after = "";
  while (records.length < MAX_RECORDS) {
    const url = `${API}/balance_transactions?limit=${PAGE_SIZE}&created%5Bgte%5D=${since}${after && `&starting_after=${after}`}`;
    const page = JSON.parse((await get({ url })).body) as { data: BalanceTransaction[]; has_more: boolean };
    records.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    after = page.data[page.data.length - 1].id;
  }
  return summarize(records.slice(0, MAX_RECORDS), now, livemode);
}

export const stripeProvider: Provider<StripeData> = {
  id: "stripe",
  intervalMs: 5 * 60_000,
  needsSetup: async () => !(await invoke<boolean>("secret_has", { id: STRIPE_SECRET })),
  fetch: fetchStripe,
};

export const STRIPE_SAMPLE: StripeData = {
  currency: "USD",
  today: 184,
  week: 2980,
  month30: 5336,
  daily: [290, 390, 325, 322, 320, 372, 362, 352, 395, 400, 385, 402, 420, 360],
  change: 31,
  testMode: false,
  payments: { today: 2, week: 11, month30: 40 },
};
