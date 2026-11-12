import { CARD } from "../core/names";
import type { FC } from "react";
import { invoke } from "../core/tauri";
import { refresh } from "../core/provider";
import { statusProvider } from "../widgets/_providers/status";
import { BluetoothCard } from "./bluetooth/BluetoothCard";
import { NotificationsCard } from "./notifications/NotificationsCard";
import { QuickCard } from "./quick/QuickCard";
import { SearchCard } from "./search/SearchCard";
import { SoundCard } from "./sound/SoundCard";
import { WifiCard } from "./wifi/WifiCard";

export type PanelId = "sound" | "wifi" | "bluetooth" | "quick" | "search" | "notifications";

export interface PanelDef {
  Card: FC;
  width: number;
}

export const panels: Record<PanelId, PanelDef> = {
  sound: { Card: SoundCard, width: 340 },
  wifi: { Card: WifiCard, width: 340 },
  bluetooth: { Card: BluetoothCard, width: 340 },
  quick: { Card: QuickCard, width: 340 },
  search: { Card: SearchCard, width: 560 },
  notifications: { Card: NotificationsCard, width: 340 },
};

const FIRST_HEIGHT = 300;

function panelCardId(id: PanelId): string {
  return `${CARD.panel}${id}`;
}

/** Opens a panel centred over the thing that was clicked. */
export function openPanel(id: PanelId, anchor: HTMLElement): void {
  const panel = panels[id];
  const r = anchor.getBoundingClientRect();
  invoke("open_card", {
    widgetId: panelCardId(id),
    tileX: r.left,
    tileWidth: r.width,
    width: panel.width,
    height: FIRST_HEIGHT,
  }).catch(() => {});
}

/** From inside a card: the same place, a different panel. */
export function goToPanel(id: PanelId): void {
  invoke("swap_card", { widgetId: panelCardId(id), width: panels[id].width }).catch(() => {});
}

/** The card and the dock are separate windows, so a change has to be announced for the tile to follow. */
export function statusChanged(): void {
  refresh(statusProvider);
}
