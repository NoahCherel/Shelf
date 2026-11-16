// Apart from ./tauri on purpose: many tests replace that module whole, and a dock rendered
// there must still know which window it is.
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/** This window's label: "dock" for the main dock, "dock-2" and on for the others. Outside Shelf, "dock". */
export function windowLabel(): string {
  return isTauri() ? getCurrentWebviewWindow().label : "dock";
}
