import type { Category, WidgetDef } from "./widget";

type Modules = Record<string, { default?: WidgetDef }>;

/** Folders starting with "_" only count in tests. */
export function collect(modules: Modules, mode: string): WidgetDef[] {
  const seen = new Set<string>();
  const found: WidgetDef[] = [];
  for (const [path, mod] of Object.entries(modules)) {
    if (path.includes("/widgets/_") && mode !== "test") continue;
    if (!mod.default) throw new Error(`${path} exports no widget`);
    if (seen.has(mod.default.id)) throw new Error(`duplicate widget id: ${mod.default.id}`);
    seen.add(mod.default.id);
    found.push(mod.default);
  }
  return found;
}

export const widgets: WidgetDef[] = collect(
  import.meta.glob<{ default?: WidgetDef }>("../widgets/*/index.tsx", { eager: true }),
  import.meta.env.MODE,
);

export function byId(id: string): WidgetDef | undefined {
  return widgets.find((w) => w.id === id);
}

export function byCategory(list: WidgetDef[] = widgets): Map<Category, WidgetDef[]> {
  const groups = new Map<Category, WidgetDef[]>();
  for (const w of list) {
    groups.set(w.category, [...(groups.get(w.category) ?? []), w]);
  }
  return groups;
}
