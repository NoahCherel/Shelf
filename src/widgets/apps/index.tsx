import { invoke } from "../../core/tauri";
import { defineWidget } from "../../core/widget";
import { stableOrder, takeReordered, type AppEntry } from "./entry";
import { AppsTile } from "./Tile";

const sampleEntry = (name: string, open: boolean): AppEntry => ({
  key: `sample-${name}`,
  name,
  pinned: true,
  active: false,
  windows: open ? [{ hwnd: 0, title: name }] : [],
});

export default defineWidget<AppEntry[]>({
  id: "apps",
  name: "Apps",
  description: "The Start button, pinned apps and open windows.",
  category: "apps-files",
  width: (data) => 0.96 * ((data?.length ?? 0) + 2),
  sample: ["Browser", "Files", "Mail", "Terminal", "Code"].map((name, i) => sampleEntry(name, i % 2 === 0)),
  Tile: AppsTile,
  provider: {
    id: "apps",
    intervalMs: 1500,
    cache: false,
    fetch: async (previous) => {
      const next = await invoke<AppEntry[]>("apps_list");
      return takeReordered() ? next : stableOrder(previous ?? [], next);
    },
  },
});
