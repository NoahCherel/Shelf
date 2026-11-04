import type { FC } from "react";

export type Category =
  | "clocks"
  | "productivity"
  | "system"
  | "apps-files"
  | "media-audio"
  | "ai"
  | "analytics"
  | "social"
  | "stocks"
  | "finance"
  | "weather"
  | "online-mail"
  | "developer";

export type Status = "sample" | "loading" | "ready" | "stale" | "error";

export type ProviderError = {
  kind: "rejected" | "forbidden" | "offline" | "notfound" | "locked" | "other";
  message: string;
};

export interface Provider<D> {
  id: string;
  intervalMs: number;
  /** Set false for values that are worthless later, like the time. */
  cache?: boolean;
  /** True when the account isn't connected yet; the tile then shows its sample. */
  needsSetup?: () => Promise<boolean>;
  /** Throws ProviderError. */
  fetch: (previous: D | null) => Promise<D>;
}

export interface TileProps<D> {
  data: D | null;
  status: Status;
  error?: ProviderError;
  /** Drawn in the picker: from sample data, with nothing clickable. */
  preview?: boolean;
  refresh?: () => void;
}

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  checked?: boolean;
}

export interface MenuCtx {
  refresh: () => void;
}

export interface WidgetDef<D = any> {
  id: string;
  name: string;
  description: string;
  category: Category;
  /** In tile heights. */
  width: number | ((data: D | null) => number);
  Tile: FC<TileProps<D>>;
  Card?: FC<TileProps<D>>;
  /** Fixed height of the card, in px. */
  cardHeight?: number;
  cardWidth?: number;
  provider?: Provider<D>;
  sample?: D;
  menu?: (ctx: MenuCtx) => MenuItem[];
}

export function defineWidget<D>(def: WidgetDef<D>): WidgetDef<D> {
  return def;
}

export function widthOf<D>(def: WidgetDef<D>, data: D | null): number {
  return typeof def.width === "function" ? def.width(data) : def.width;
}
