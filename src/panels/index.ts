import type { FC } from "react";
import { BluetoothCard } from "./bluetooth/BluetoothCard";
import { NotificationsCard } from "./notifications/NotificationsCard";
import { PANEL_WIDTH, type PanelId } from "./open";
import { QuickCard } from "./quick/QuickCard";
import { SearchCard } from "./search/SearchCard";
import { SoundCard } from "./sound/SoundCard";
import { WifiCard } from "./wifi/WifiCard";

export { goToPanel, openPanel, statusChanged, type PanelId } from "./open";

export interface PanelDef {
  Card: FC;
  width: number;
}

const card = (Card: FC, id: PanelId): PanelDef => ({ Card, width: PANEL_WIDTH[id] });

export const panels: Record<PanelId, PanelDef> = {
  sound: card(SoundCard, "sound"),
  wifi: card(WifiCard, "wifi"),
  bluetooth: card(BluetoothCard, "bluetooth"),
  quick: card(QuickCard, "quick"),
  search: card(SearchCard, "search"),
  notifications: card(NotificationsCard, "notifications"),
};
