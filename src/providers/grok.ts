// Grok CLI credits usage via the official `grok agent stdio` ACP interface.
// Shelf never reads `~/.grok/auth.json` or xAI OAuth tokens directly.
import { refresh } from "../core/provider";
import { invoke } from "../core/tauri";
import type { Provider } from "../core/widget";
import { toWindow, type LimitWindow } from "./claude";

export const MONTH_MS = 30 * 86_400_000;

export interface GrokData {
  plan: string | null;
  credits: LimitWindow | null;
  history: number[];
  updatedMs: number;
}

export const GROK_SAMPLE: GrokData = {
  plan: "SuperGrok",
  credits: {
    percent: 34,
    get resetsAt() {
      return Date.now() + 12 * 86_400_000;
    },
  },
  history: [8, 14, 19, 25, 30, 34],
  updatedMs: 0,
};

interface RawWindow {
  used_percentage: number;
  resets_at: number;
}

interface RawGrokUsage {
  connected: boolean;
  plan?: string | null;
  usage: { credits?: RawWindow | null } | null;
  history?: number[];
}

export async function forceRefreshGrok(): Promise<void> {
  await invoke<RawGrokUsage>("grok_usage", { force: true }).catch(() => null);
  refresh(grokProvider);
}

function toGrokWindow(raw: RawWindow | null | undefined, now: number): LimitWindow | null {
  if (!raw) return null;
  if (!raw.resets_at || raw.resets_at <= 0) {
    return { percent: Math.min(100, Math.max(0, raw.used_percentage)), resetsAt: null };
  }
  return toWindow(raw, now);
}

export const grokProvider: Provider<GrokData> = {
  id: "grok",
  intervalMs: 60_000,
  needsSetup: async () => !(await invoke<RawGrokUsage>("grok_usage")).connected,
  fetch: async () => {
    const { usage, plan, history } = await invoke<RawGrokUsage>("grok_usage");
    const now = Date.now();
    return {
      plan: plan ?? null,
      credits: toGrokWindow(usage?.credits, now),
      history: history ?? [],
      updatedMs: Math.floor(now / 60_000) * 60_000,
    };
  },
};
