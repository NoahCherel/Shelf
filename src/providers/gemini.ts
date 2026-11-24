// Antigravity (Gemini) quotas read through the official `agy` CLI (`agy -p "/usage"`).
// Shelf never reads Google/Antigravity OAuth credentials or probes local ports.
import { refresh } from "../core/provider";
import { invoke } from "../core/tauri";
import type { Provider } from "../core/widget";
import { toWindow, type LimitWindow } from "./claude";

export interface GeminiGroup {
  name: string;
  session: LimitWindow | null;
  weekly: LimitWindow | null;
}

export interface GeminiData {
  plan: string | null;
  session: LimitWindow | null;
  weekly: LimitWindow | null;
  groups: GeminiGroup[];
  history: number[];
  updatedMs: number;
}

export const GEMINI_SAMPLE: GeminiData = {
  plan: "Antigravity",
  session: {
    percent: 24,
    get resetsAt() {
      return Date.now() + 4 * 3_600_000 + 18 * 60_000;
    },
  },
  weekly: {
    percent: 6,
    get resetsAt() {
      return Date.now() + 6 * 86_400_000;
    },
  },
  groups: [
    {
      name: "Gemini Models",
      session: {
        percent: 24,
        get resetsAt() {
          return Date.now() + 4 * 3_600_000 + 18 * 60_000;
        },
      },
      weekly: {
        percent: 6,
        get resetsAt() {
          return Date.now() + 6 * 86_400_000;
        },
      },
    },
  ],
  history: [4, 9, 14, 19, 24],
  updatedMs: 0,
};

interface RawWindow {
  used_percentage: number;
  resets_at: number;
}

interface RawGroup {
  name: string;
  session?: RawWindow | null;
  weekly?: RawWindow | null;
}

interface RawGeminiUsage {
  connected: boolean;
  plan?: string | null;
  usage: {
    session?: RawWindow | null;
    weekly?: RawWindow | null;
    groups?: RawGroup[];
  } | null;
  history?: number[];
}

export async function forceRefreshGemini(): Promise<void> {
  await invoke<RawGeminiUsage>("gemini_usage", { force: true }).catch(() => null);
  refresh(geminiProvider);
}

export const geminiProvider: Provider<GeminiData> = {
  id: "gemini",
  intervalMs: 120_000,
  needsSetup: async () => !(await invoke<RawGeminiUsage>("gemini_usage")).connected,
  fetch: async () => {
    const { usage, plan, history } = await invoke<RawGeminiUsage>("gemini_usage");
    const now = Date.now();
    const groups: GeminiGroup[] = (usage?.groups ?? []).map((g) => ({
      name: g.name,
      session: toWindow(g.session ?? undefined, now),
      weekly: toWindow(g.weekly ?? undefined, now),
    }));
    return {
      plan: plan ?? null,
      session: toWindow(usage?.session ?? undefined, now),
      weekly: toWindow(usage?.weekly ?? undefined, now),
      groups,
      history: history ?? [],
      updatedMs: Math.floor(now / 60_000) * 60_000,
    };
  },
};
