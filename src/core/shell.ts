import { create } from "zustand";
import { setPaused } from "./provider";
import { invoke, listen } from "./tauri";

interface ShellStatus {
  fullscreen: boolean;
  locked: boolean;
}

export const useShell = create<ShellStatus>(() => ({ fullscreen: false, locked: false }));

/** The dock shows − badges and allows dragging while the picker is open. */
export const usePicker = create<{ open: boolean }>(() => ({ open: false }));

const apply = ({ fullscreen, locked }: ShellStatus) => {
  useShell.setState({ fullscreen, locked });
  setPaused(fullscreen || locked);
};

/** Follows fullscreen and lock changes from Rust. Providers rest during both. */
export function syncShell(): void {
  invoke<ShellStatus>("shell_status").then(apply, () => {});
  listen<ShellStatus>("shell-changed", apply);
  listen<boolean>("picker-open", (open) => usePicker.setState({ open }));
}
