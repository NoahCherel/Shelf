import { CARD } from "../core/names";
import { invoke } from "../core/tauri";
import { refresh } from "../core/provider";
import { statusProvider } from "../widgets/_providers/status";

export type PanelId = "sound" | "wifi" | "bluetooth" | "quick" | "search" | "notifications";

/** How wide each panel's card is. The cards themselves are in ./index, which imports them all. */
export const PANEL_WIDTH: Record<PanelId, number> = {
  sound: 340,
  wifi: 340,
  bluetooth: 340,
  quick: 340,
  search: 560,
  notifications: 340,
};

const FIRST_HEIGHT = 300;

function panelCardId(id: PanelId): string {
  return `${CARD.panel}${id}`;
}

/** Opens a panel centred over the thing that was clicked. */
export function openPanel(id: PanelId, anchor: HTMLElement): void {
  const r = anchor.getBoundingClientRect();
  invoke("open_card", {
    widgetId: panelCardId(id),
    tileX: r.left,
    tileWidth: r.width,
    width: PANEL_WIDTH[id],
    height: FIRST_HEIGHT,
  }).catch(() => {});
}

/** From inside a card: the same place, a different panel. */
export function goToPanel(id: PanelId): void {
  invoke("swap_card", { widgetId: panelCardId(id), width: PANEL_WIDTH[id] }).catch(() => {});
}

/** The card and the dock are separate windows, so a change has to be announced for the tile to follow. */
export function statusChanged(): void {
  refresh(statusProvider);
}
