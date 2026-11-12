import { create } from "zustand";
import { setDockIds } from "./dockIds";
import { STORE } from "./names";
import { invoke, listen } from "./tauri";
import { isPinId } from "./pinId";
import { widgets } from "./registry";

export const DEFAULT_LAYOUT = ["claude-plan-usage", "apps", "github-activity", "system-status", "clock-and-weather"];

/** Layouts older than this haven't met the status tile, and get it once. Removing it after sticks. */
const VERSION = 2;
const STATUS_TILE = "system-status";

interface Layout {
  ids: string[];
  /** Where each widget was put on a full-width dock: 0 against the left end, 1 against the right. */
  positions: Record<string, number>;
  add(id: string): void;
  remove(id: string): void;
  move(from: number, to: number): void;
  /** A widget let go somewhere on a full-width dock, and the order that leaves them in. */
  place(id: string, at: number, order: string[]): void;
  load(): Promise<void>;
}

function known(ids: unknown[]): string[] {
  const registered = new Set(widgets.map((w) => w.id));
  const clean = ids.filter((id): id is string => typeof id === "string" && (registered.has(id) || isPinId(id)));
  return [...new Set(clean)];
}

function knownPositions(raw: unknown, ids: string[]): Record<string, number> {
  if (typeof raw !== "object" || raw === null) return {};
  const kept = Object.entries(raw).filter((e): e is [string, number] => ids.includes(e[0]) && typeof e[1] === "number" && Number.isFinite(e[1]));
  return Object.fromEntries(kept.map(([id, at]) => [id, Math.min(1, Math.max(0, at))]));
}

function save(ids: string[], positions: Record<string, number>) {
  invoke("store_save", { name: STORE.layout, value: { version: VERSION, ids, positions } }).catch(() => {});
}

export const useLayout = create<Layout>((set, get) => {
  // Every change saves the positions too, so a window that adds a widget can't drop them.
  const change = (ids: string[], positions = get().positions) => {
    const kept = Object.fromEntries(Object.entries(positions).filter(([id]) => ids.includes(id)));
    set({ ids, positions: kept });
    save(ids, kept);
  };
  return {
    ids: [],
    positions: {},
    add(id) {
      if (!get().ids.includes(id)) change([...get().ids, id]);
    },
    remove(id) {
      if (get().ids.includes(id)) change(get().ids.filter((x) => x !== id));
    },
    move(from, to) {
      const ids = [...get().ids];
      const [item] = ids.splice(from, 1);
      if (item === undefined) return;
      ids.splice(to, 0, item);
      change(ids);
    },
    place(id, at, order) {
      change(known(order), { ...get().positions, [id]: Math.min(1, Math.max(0, at)) });
    },
    async load() {
      const saved = (await invoke("store_load", { name: STORE.layout }).catch(() => null)) as { ids?: unknown; version?: number; positions?: unknown } | null;
      // A missing or broken file gets the default; ids that no longer exist just drop out.
      if (!Array.isArray(saved?.ids)) {
        set({ ids: known(DEFAULT_LAYOUT), positions: {} });
        return;
      }
      const outdated = (saved.version ?? 1) < VERSION;
      const ids = known(outdated ? [...saved.ids, STATUS_TILE] : saved.ids);
      set({ ids, positions: knownPositions(saved.positions, ids) });
    },
  };
});

useLayout.subscribe((layout) => setDockIds(layout.ids));

/** Loads the layout and follows changes made in other windows. */
export function syncLayout(): void {
  useLayout.getState().load();
  listen<string>("store-changed", (name) => {
    if (name === STORE.layout) useLayout.getState().load();
  });
}
