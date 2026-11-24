// Codex limits come only from Codex CLI's local session logs (~/.codex/sessions).
// Shelf never reads Codex's saved login or auth files.
import { invoke } from "../core/tauri";
import type { Provider } from "../core/widget";
import { toWindow, type LimitWindow } from "./claude";

export interface ChatGptWindow extends LimitWindow {
  windowMs?: number;
}

export interface ChatGptData {
  plan: string | null;
  session: ChatGptWindow | null;
  weekly: ChatGptWindow | null;
  history: number[];
  updatedMs: number;
}

export const CHATGPT_SAMPLE: ChatGptData = {
  plan: "Pro",
  session: {
    percent: 25,
    get resetsAt() {
      return Date.now() + 190 * 60_000;
    },
  },
  weekly: {
    percent: 18,
    get resetsAt() {
      return Date.now() + 4 * 86_400_000;
    },
  },
  history: [4, 8, 12, 11, 16, 21, 25],
  updatedMs: 0,
};

interface RawWindow {
  used_percentage: number;
  resets_at: number;
  window_minutes?: number | null;
}

interface RawChatGptUsage {
  connected: boolean;
  plan?: string | null;
  usage: { primary?: RawWindow; secondary?: RawWindow } | null;
  history?: number[];
}

function formatPlan(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

function toChatGptWindow(raw: RawWindow | undefined, now: number): ChatGptWindow | null {
  const base = toWindow(raw, now);
  if (!base) return null;
  const windowMs = raw?.window_minutes && raw.window_minutes > 0 ? raw.window_minutes * 60_000 : undefined;
  return windowMs ? { ...base, windowMs } : base;
}

export const chatgptProvider: Provider<ChatGptData> = {
  id: "chatgpt",
  intervalMs: 60_000,
  needsSetup: async () => !(await invoke<RawChatGptUsage>("chatgpt_usage")).connected,
  fetch: async () => {
    const { usage, plan, history } = await invoke<RawChatGptUsage>("chatgpt_usage");
    const now = Date.now();
    return {
      plan: formatPlan(plan),
      session: toChatGptWindow(usage?.primary, now),
      weekly: toChatGptWindow(usage?.secondary, now),
      history: history ?? [],
      updatedMs: Math.floor(now / 60_000) * 60_000,
    };
  },
};
