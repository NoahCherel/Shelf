import type { FC } from "react";
import { invoke } from "../core/tauri";
import { refresh } from "../core/provider";
import { statusProvider } from "../widgets/_providers/status";
import { SoundCard } from "./sound/SoundCard";
import { WifiCard } from "./wifi/WifiCard";

export type PanelId = "sound" | "wifi" | "quick" | "search";

export interface PanelDef {
  Card: FC;
  width: number;
}

/** Each panel adds itself here as it's built. */
export const panels: Partial<Record<PanelId, PanelDef>> = {
  sound: { Card: SoundCard, width: 340 },
  wifi: { Card: WifiCard, width: 340 },
};

const FIRST_HEIGHT = 300;

export function panelCardId(id: PanelId): string {
  return `__panel:${id}`;
}

/** Opens a panel centred over the thing that was clicked. */
export function openPanel(id: PanelId, anchor: HTMLElement): void {
  const panel = panels[id];
  if (!panel) {
    invoke("shell_panel", { kind: id }).catch(() => {});
    return;
  }
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
  const panel = panels[id];
  if (panel) invoke("swap_card", { widgetId: panelCardId(id), width: panel.width }).catch(() => {});
}

/** The card and the dock are separate windows, so a change has to be announced for the tile to follow. */
export function statusChanged(): void {
  refresh(statusProvider);
}
