// Z.ai / Zhipu BigModel Coding Plan usage quotas via DPAPI-stored API key.
// Auto-detects international (api.z.ai) vs China domestic (open.bigmodel.cn).
import { STORE } from "../core/names";
import { invoke } from "../core/tauri";
import type { Provider, ProviderError } from "../core/widget";
import type { LimitWindow } from "./claude";
import { httpGet } from "./http";

export const GLM_SECRET = "glm";

export type GlmRegion = "zai" | "bigmodel";

const ENDPOINTS: Record<GlmRegion, string> = {
  zai: "https://api.z.ai/api/monitor/usage/quota/limit",
  bigmodel: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
};
const AUTH = { id: GLM_SECRET, header: "Authorization", prefix: "Bearer " };
const MAX_HISTORY = 24;

export interface GlmMcpDetail {
  name: string;
  usage: number;
}

export interface GlmData {
  region: GlmRegion;
  session: LimitWindow | null;
  weekly: LimitWindow | null;
  mcp: LimitWindow | null;
  mcpDetails: GlmMcpDetail[];
  history: number[];
  updatedMs: number;
}

interface GlmStore {
  region?: GlmRegion | null;
  history?: number[];
  lastResetAt?: number | null;
}

interface RawGlmLimit {
  type?: string;
  unit?: number;
  number?: number;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  percentage?: number;
  nextResetTime?: number;
  usageDetails?: Array<{ modelCode?: string; usage?: number }>;
}

interface RawGlmResponse {
  code?: number;
  msg?: string;
  success?: boolean;
  data?: {
    limits?: RawGlmLimit[];
  };
}

export const GLM_SAMPLE: GlmData = {
  region: "zai",
  session: {
    percent: 28,
    get resetsAt() {
      return Date.now() + 3 * 3_600_000 + 15 * 60_000;
    },
  },
  weekly: {
    percent: 14,
    get resetsAt() {
      return Date.now() + 4 * 86_400_000;
    },
  },
  mcp: {
    percent: 12,
    get resetsAt() {
      return Date.now() + 14 * 86_400_000;
    },
  },
  mcpDetails: [
    { name: "search-prime", usage: 8 },
    { name: "web-reader", usage: 4 },
  ],
  history: [6, 11, 16, 22, 28],
  updatedMs: 0,
};

/** Z.ai / BigModel returns nextResetTime in ms; normalize safely for both ms and s. */
export function normalizeResetMs(raw: number | undefined): number | null {
  if (!raw || !Number.isFinite(raw) || raw <= 0) return null;
  return raw > 1e12 ? raw : raw * 1000;
}

function toLimitWindow(raw: RawGlmLimit, now: number): LimitWindow {
  const resetsAt = normalizeResetMs(raw.nextResetTime);
  if (resetsAt !== null && resetsAt <= now) {
    return { percent: 0, resetsAt: null };
  }
  const pct =
    typeof raw.percentage === "number" && Number.isFinite(raw.percentage)
      ? raw.percentage
      : raw.usage && raw.usage > 0 && typeof raw.currentValue === "number"
        ? (raw.currentValue / raw.usage) * 100
        : 0;
  return { percent: Math.min(100, Math.max(0, pct)), resetsAt };
}

export function parseGlmLimits(
  limits: RawGlmLimit[],
  now: number,
): { session: LimitWindow | null; weekly: LimitWindow | null; mcp: LimitWindow | null; mcpDetails: GlmMcpDetail[] } {
  const tokenLimits = limits.filter((l) => l.type === "TOKENS_LIMIT");
  const timeLimit = limits.find((l) => l.type === "TIME_LIMIT");

  let sessionRaw: RawGlmLimit | undefined;
  let weeklyRaw: RawGlmLimit | undefined;

  for (const l of tokenLimits) {
    // unit 3 = hours (5h session window); unit 6 / number >= 7 = weekly window
    const isFiveHour = l.unit === 3 && (l.number === 5 || !l.number);
    const isWeekly = l.unit === 6 || (l.unit === 4 && (l.number ?? 0) >= 7) || (l.unit === 3 && (l.number ?? 0) >= 24);
    if (isFiveHour && !sessionRaw) {
      sessionRaw = l;
    } else if (isWeekly && !weeklyRaw) {
      weeklyRaw = l;
    } else if (!sessionRaw) {
      sessionRaw = l;
    } else if (!weeklyRaw) {
      weeklyRaw = l;
    }
  }

  const mcpDetails: GlmMcpDetail[] = (timeLimit?.usageDetails ?? [])
    .filter((d): d is { modelCode: string; usage: number } => Boolean(d.modelCode) && typeof d.usage === "number")
    .map((d) => ({ name: d.modelCode, usage: d.usage }));

  return {
    session: sessionRaw ? toLimitWindow(sessionRaw, now) : null,
    weekly: weeklyRaw ? toLimitWindow(weeklyRaw, now) : null,
    mcp: timeLimit ? toLimitWindow(timeLimit, now) : null,
    mcpDetails,
  };
}

async function queryRegion(region: GlmRegion): Promise<{ ok: true; limits: RawGlmLimit[] } | { ok: false; status: number; msg?: string }> {
  const res = await httpGet({
    url: ENDPOINTS[region],
    headers: { Accept: "application/json" },
    secret: AUTH,
  });
  if (res.status >= 400) {
    return { ok: false, status: res.status };
  }
  try {
    const body = JSON.parse(res.body) as RawGlmResponse;
    if (body.success === false || (typeof body.code === "number" && body.code !== 200 && body.code !== 0)) {
      return { ok: false, status: body.code === 401 ? 401 : 403, msg: body.msg };
    }
    return { ok: true, limits: body.data?.limits ?? [] };
  } catch {
    return { ok: false, status: 500, msg: "Unexpected response from GLM API." };
  }
}

function nextHistory(store: GlmStore, session: LimitWindow | null): number[] {
  let history = Array.isArray(store.history) ? [...store.history] : [];
  if (!session) return history;
  if (store.lastResetAt && session.resetsAt && Math.abs(session.resetsAt - store.lastResetAt) > 60_000) {
    history = [];
  }
  const pct = Math.min(100, Math.max(0, session.percent));
  const last = history[history.length - 1];
  if (last === undefined || Math.abs(last - pct) >= 0.05) {
    history.push(pct);
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  }
  return history;
}

export async function clearGlmStore(): Promise<void> {
  await invoke("store_save", { name: STORE.glmHistory, value: { region: null, history: [], lastResetAt: null } }).catch(() => {});
}

export async function fetchGlm(): Promise<GlmData> {
  const store = (await invoke<GlmStore | null>("store_load", { name: STORE.glmHistory }).catch(() => null)) ?? {};
  const candidates: GlmRegion[] = store.region === "bigmodel" ? ["bigmodel", "zai"] : ["zai", "bigmodel"];

  let chosenRegion: GlmRegion | null = null;
  let limits: RawGlmLimit[] = [];
  let lastError: { status: number; msg?: string } = { status: 401 };

  for (const region of candidates) {
    const attempt = await queryRegion(region);
    if (attempt.ok) {
      chosenRegion = region;
      limits = attempt.limits;
      break;
    }
    lastError = attempt;
    // Only fall back to the other region on auth/platform rejection.
    if (attempt.status !== 401 && attempt.status !== 403 && attempt.status !== 404) break;
  }

  if (!chosenRegion) {
    if (lastError.status === 401) {
      throw { kind: "rejected", message: "Z.ai / BigModel didn't accept this API key. Check it and connect again." } satisfies ProviderError;
    }
    if (lastError.status === 403) {
      throw {
        kind: "forbidden",
        message: lastError.msg ?? "This key doesn't appear to have an active GLM Coding Plan.",
      } satisfies ProviderError;
    }
    throw { kind: "other", message: lastError.msg ?? `GLM API answered with an error (${lastError.status}).` } satisfies ProviderError;
  }

  const now = Date.now();
  const parsed = parseGlmLimits(limits, now);
  const history = nextHistory(store, parsed.session);
  await invoke("store_save", {
    name: STORE.glmHistory,
    value: { region: chosenRegion, history, lastResetAt: parsed.session?.resetsAt ?? null },
  }).catch(() => {});

  return {
    region: chosenRegion,
    session: parsed.session,
    weekly: parsed.weekly,
    mcp: parsed.mcp,
    mcpDetails: parsed.mcpDetails,
    history,
    updatedMs: Math.floor(now / 60_000) * 60_000,
  };
}

export const glmProvider: Provider<GlmData> = {
  id: "glm",
  intervalMs: 60_000,
  needsSetup: async () => !(await invoke<boolean>("secret_has", { id: GLM_SECRET })),
  fetch: fetchGlm,
};
