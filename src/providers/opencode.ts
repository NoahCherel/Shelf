// OpenCode local usage, read completely offline from OpenCode's local SQLite history.
import { invoke } from "../core/tauri";
import type { Provider } from "../core/widget";

export interface OpenCodeBucket {
  tokens: number;
  input: number;
  output: number;
  cache: number;
  cost: number;
  messages: number;
}

export interface OpenCodeModel {
  name: string;
  tokens: number;
  cost: number;
}

export interface OpenCodeData {
  session: OpenCodeBucket;
  weekly: OpenCodeBucket;
  allTime?: OpenCodeBucket;
  topModel: OpenCodeModel | null;
  models: OpenCodeModel[];
  allTimeModels?: OpenCodeModel[];
  dailyTokens: number[];
  updatedMs: number;
}

interface RawOpenCodeUsage {
  connected: boolean;
  session: OpenCodeBucket | null;
  weekly: OpenCodeBucket | null;
  all_time?: OpenCodeBucket | null;
  top_model: OpenCodeModel | null;
  models?: OpenCodeModel[];
  all_time_models?: OpenCodeModel[];
  daily_tokens?: number[];
}

const EMPTY_BUCKET: OpenCodeBucket = { tokens: 0, input: 0, output: 0, cache: 0, cost: 0, messages: 0 };

export const OPENCODE_SAMPLE: OpenCodeData = {
  session: { tokens: 185_400, input: 112_000, output: 28_400, cache: 45_000, cost: 0.64, messages: 18 },
  weekly: { tokens: 1_420_000, input: 840_000, output: 210_000, cache: 370_000, cost: 4.82, messages: 142 },
  topModel: { name: "claude-sonnet-4.5", tokens: 980_000, cost: 3.2 },
  models: [
    { name: "claude-sonnet-4.5", tokens: 980_000, cost: 3.2 },
    { name: "gpt-5", tokens: 440_000, cost: 1.62 },
  ],
  dailyTokens: [120_000, 195_000, 160_000, 280_000, 210_000, 270_000, 185_400],
  updatedMs: 0,
};

export function formatCostUsd(cost: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cost);
}

export const opencodeProvider: Provider<OpenCodeData> = {
  id: "opencode",
  intervalMs: 60_000,
  needsSetup: async () => !(await invoke<RawOpenCodeUsage>("opencode_usage")).connected,
  fetch: async () => {
    const raw = await invoke<RawOpenCodeUsage>("opencode_usage");
    const now = Date.now();
    return {
      session: raw.session ?? EMPTY_BUCKET,
      weekly: raw.weekly ?? EMPTY_BUCKET,
      allTime: raw.all_time ?? undefined,
      topModel: raw.top_model ?? null,
      models: raw.models ?? [],
      allTimeModels: raw.all_time_models ?? [],
      dailyTokens: raw.daily_tokens ?? [],
      updatedMs: Math.floor(now / 60_000) * 60_000,
    };
  },
};
