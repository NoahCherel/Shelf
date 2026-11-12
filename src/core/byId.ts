import { pinWidget } from "./pinWidget";
import { widgets } from "./registry";
import type { WidgetDef } from "./widget";

/** A widget by its id: one of Shelf's own, or one opening an app or a folder of the owner's. */
export function byId(id: string): WidgetDef | undefined {
  return widgets.find((w) => w.id === id) ?? pinWidget(id, widgets.find((w) => w.id === "apps")?.provider);
}
