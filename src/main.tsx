import { createRoot } from "react-dom/client";
import type { ComponentType } from "react";
import "./design";
import { syncLayout } from "./core/layout";
import { followLook } from "./core/look";
import { syncSettings } from "./core/settings";

const PICKER_T = 62;

type View = () => Promise<ComponentType>;

// Each window only loads the code for its own view.
const views: Record<string, View> = {
  dock: () => import("./windows/dock/DockWindow").then((m) => m.DockWindow),
  card: () => import("./windows/card/CardWindow").then((m) => m.CardWindow),
  preview: () => import("./windows/preview/PreviewWindow").then((m) => m.PreviewWindow),
  picker: () => {
    syncLayout();
    return import("./windows/picker/PickerWindow").then((m) => m.PickerWindow);
  },
  settings: () => import("./windows/settings/SettingsWindow").then((m) => m.SettingsWindow),
  gallery: () => import("./windows/gallery/Gallery").then((m) => m.Gallery),
  bench: () => import("./windows/bench/BenchWindow").then((m) => m.BenchWindow),
};

const name = new URLSearchParams(location.search).get("w") ?? "dock";

// The browser's own menu has no place in an app, except where text can be edited.
document.addEventListener("contextmenu", (e) => {
  if (!(e.target as HTMLElement).closest("input, textarea")) e.preventDefault();
});

// The bench's stand-in backend and stopped clock have to be in place before anything else runs.
const ready = name === "bench" ? import("./windows/bench/prepare").then((m) => m.prepareBench()) : Promise.resolve();

// Settings first: providers need them, and the first paint should already be right.
ready
  .then(syncSettings)
  .then(() => {
    // The picker's tiles stay one size whatever size the dock is.
    followLook(name === "picker" ? PICKER_T : undefined);
    return (views[name] ?? views.dock)();
  })
  .then((View) => {
    createRoot(document.getElementById("root")!).render(<View />);
  });
