// Cursor usage quotas fetched in Rust via Cursor's local sign-in and api2.cursor.sh.
import { refresh } from "../core/provider";
import { invoke } from "../core/tauri";
import type { Provider } from "../core/widget";
import { toWindow, type LimitWindow } from "./claude";

export interface CursorData {
  plan: string | null;
  auto: LimitWindow | null;
  api: LimitWindow | null;
  onDemandCents: number | null;
  renewalAt: number | null;
  history: number[];
  updatedMs: number;
}

export const CURSOR_SAMPLE: CursorData = {
  plan: "Pro",
  auto: {
    percent: 42,
    get resetsAt() {
      return Date.now() + 11 * 86_400_000;
    },
  },
  api: {
    percent: 18,
    get resetsAt() {
      return Date.now() + 11 * 86_400_000;
    },
  },
  onDemandCents: 350,
  get renewalAt() {
    return Date.now() + 11 * 86_400_000;
  },
  history: [10, 18, 26, 33, 38, 42],
  updatedMs: 0,
};

interface RawWindow {
  used_percentage: number;
  resets_at: number;
}

interface RawCursorUsage {
  connected: boolean;
  plan?: string | null;
  usage: {
    auto?: RawWindow | null;
    api?: RawWindow | null;
    on_demand_cents?: number | null;
    renewal_at?: number | null;
  } | null;
  history?: number[];
}

export async function forceRefreshCursor(): Promise<void> {
  await invoke<RawCursorUsage>("cursor_usage", { force: true }).catch(() => null);
  refresh(cursorProvider);
}

function toCursorWindow(raw: RawWindow | null | undefined, now: number): LimitWindow | null {
  if (!raw) return null;
  if (!raw.resets_at || raw.resets_at <= 0) {
    return { percent: Math.min(100, Math.max(0, raw.used_percentage)), resetsAt: null };
  }
  return toWindow(raw, now);
}

export const cursorProvider: Provider<CursorData> = {
  id: "cursor",
  intervalMs: 60_000,
  needsSetup: async () => !(await invoke<RawCursorUsage>("cursor_usage")).connected,
  fetch: async () => {
    const { usage, plan, history } = await invoke<RawCursorUsage>("cursor_usage");
    const now = Date.now();
    const renewalRaw = usage?.renewal_at ?? null;
    const renewalAt = renewalRaw && renewalRaw > 0 ? (renewalRaw > 1e12 ? renewalRaw : renewalRaw * 1000) : null;
    return {
      plan: plan ?? null,
      auto: toCursorWindow(usage?.auto, now),
      api: toCursorWindow(usage?.api, now),
      onDemandCents: usage?.on_demand_cents ?? null,
      renewalAt,
      history: history ?? [],
      updatedMs: Math.floor(now / 60_000) * 60_000,
    };
  },
};
