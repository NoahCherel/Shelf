import { useEffect } from "react";
import { byId } from "../../core/byId";
import { listen } from "../../core/tauri";
import { windowLabel } from "../../core/windowLabel";
import { openPanel, PANEL_WIDTH, type PanelId } from "../../panels/open";
import { openWidgetCard } from "./Bar";

/**
 * Something outside the dock asks it to open a card, as a toast's button or Win+A: "panel:<id>" or
 * "widget:<id>". It opens over its button or tile, as a click would. Only the main dock answers.
 */
export function useOpenRequests(): void {
  useEffect(() => {
    if (windowLabel() !== "dock") return;
    const off = listen<{ target: string }>("open-request", ({ target }) => open(target));
    return () => void off.then((f) => f());
  }, []);
}

function open(target: string): void {
  const [kind, id] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
  if (kind === "panel" && id in PANEL_WIDTH) {
    // With its button missing, as with no Status widget, it opens over the dock as a whole.
    const anchor = document.querySelector<HTMLElement>(`[data-panel="${id}"]`) ?? document.querySelector<HTMLElement>(".dock");
    if (anchor) openPanel(id as PanelId, anchor);
    return;
  }
  if (kind === "widget") {
    const tile = document.querySelector<HTMLElement>(`[data-widget-id="${CSS.escape(id)}"]`);
    const def = byId(id);
    if (tile && def) openWidgetCard(def, tile);
  }
}
