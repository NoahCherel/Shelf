import { invoke } from "./tauri";

/** A notice above the dock. Rust holds it through quiet hours and games, and shows one at a time. */
export interface Toast {
  /** A newer toast with the same id replaces one still waiting. */
  id: string;
  title: string;
  body: string;
  /** A button asking the dock to open something: "widget:<id>" or "panel:<id>". */
  action?: { label: string; target: string } | null;
  /** Plays the alert sound chosen in Settings. */
  sound: boolean;
  /** Ms since 1970 after which it is no longer true, and is dropped if still waiting. */
  expiresAt?: number | null;
}

export function showToast(toast: Toast): void {
  invoke("toast_show", { toast }).catch(() => {});
}
