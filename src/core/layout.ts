import { create } from "zustand";
import { setDockIds } from "./dockIds";
import { invoke, listen } from "./tauri";
import { widgets } from "./registry";

export const DEFAULT_LAYOUT = ["claude-plan-usage", "apps", "github-activity", "system-status", "clock-and-weather"];

/** Layouts older than this haven't met the status tile, and get it once. Removing it after sticks. */
const VERSION = 2;
const STATUS_TILE = "system-status";

interface Layout {
  ids: string[];
  add(id: string): void;
  remove(id: string): void;
  move(from: number, to: number): void;
  load(): Promise<void>;
}

function known(ids: unknown[]): string[] {
  const registered = new Set(widgets.map((w) => w.id));
  const clean = ids.filter((id): id is string => typeof id === "string" && registered.has(id));
  return [...new Set(clean)];
}

function save(ids: string[]) {
  invoke("store_save", { name: "layout", value: { version: VERSION, ids } }).catch(() => {});
}

export const useLayout = create<Layout>((set, get) => {
  const change = (ids: string[]) => {
    set({ ids });
    save(ids);
  };
  return {
    ids: [],
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
    async load() {
      const saved = (await invoke("store_load", { name: "layout" }).catch(() => null)) as { ids?: unknown; version?: number } | null;
      // A missing or broken file gets the default; ids that no longer exist just drop out.
      if (!Array.isArray(saved?.ids)) {
        set({ ids: known(DEFAULT_LAYOUT) });
        return;
      }
      const outdated = (saved.version ?? 1) < VERSION;
      set({ ids: known(outdated ? [...saved.ids, STATUS_TILE] : saved.ids) });
    },
  };
});

useLayout.subscribe((layout) => setDockIds(layout.ids));

/** Loads the layout and follows changes made in other windows. */
export function syncLayout(): void {
  useLayout.getState().load();
  listen<string>("store-changed", (name) => {
    if (name === "layout") useLayout.getState().load();
  });
}
