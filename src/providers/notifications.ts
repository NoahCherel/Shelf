import { invoke } from "../core/tauri";
import type { Provider } from "../core/widget";

export interface NotificationRow {
  id: number;
  app: string;
  title: string;
  body: string;
  at: number;
}

export interface NotificationList {
  access: boolean;
  items: NotificationRow[];
}

/** cache is off: what a notification says never goes to disk. */
export const notificationsProvider: Provider<NotificationList> = {
  id: "notifications",
  intervalMs: 3000,
  cache: false,
  fetch: () => invoke<NotificationList>("notifications_list"),
};
