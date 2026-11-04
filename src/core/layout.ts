import { create } from "zustand";
import { invoke, listen } from "./tauri";
import { widgets } from "./registry";

export const DEFAULT_LAYOUT = ["claude-plan-usage", "apps", "github-activity", "clock-and-weather"];

const VERSION = 1;

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
      const saved = (await invoke("store_load", { name: "layout" }).catch(() => null)) as { ids?: unknown } | null;
      // A missing or broken file gets the default; ids that no longer exist just drop out.
      set({ ids: Array.isArray(saved?.ids) ? known(saved.ids) : known(DEFAULT_LAYOUT) });
    },
  };
});

/** Loads the layout and follows changes made in other windows. */
export function syncLayout(): void {
  useLayout.getState().load();
  listen<string>("store-changed", (name) => {
    if (name === "layout") useLayout.getState().load();
  });
}
