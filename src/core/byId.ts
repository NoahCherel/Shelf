import { folderWidget } from "./folderWidget";
import { pinWidget } from "./pinWidget";
import { widgets } from "./registry";
import type { WidgetDef } from "./widget";

function resolveLeaf(id: string): WidgetDef | undefined {
  return widgets.find((w) => w.id === id) ?? pinWidget(id, widgets.find((w) => w.id === "apps")?.provider);
}

/** A widget by its id: one of Shelf's own, a widget folder, or a pinned app/folder of the owner's. */
export function byId(id: string): WidgetDef | undefined {
  return resolveLeaf(id) ?? folderWidget(id, resolveLeaf);
}
