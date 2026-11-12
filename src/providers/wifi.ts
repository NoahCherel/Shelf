import { invoke } from "../core/tauri";
import type { Provider } from "../core/widget";

type WifiAuth = "open" | "wpa2" | "wpa3" | "enterprise" | "other";

export interface WifiNetwork {
  id: string;
  name: string;
  signal: number;
  auth: WifiAuth;
  saved: boolean;
  connected: boolean;
}

interface WifiAttempt {
  id: string;
  state: "connecting" | "failed";
  error: string | null;
}

export interface WifiList {
  adapter: boolean;
  on: boolean;
  permission: boolean;
  attempt: WifiAttempt | null;
  networks: WifiNetwork[];
}

export const wifiProvider: Provider<WifiList> = {
  id: "wifi",
  intervalMs: 3000,
  cache: false,
  fetch: () => invoke<WifiList>("wifi_networks"),
};
