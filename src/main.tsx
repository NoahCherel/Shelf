import { createRoot } from "react-dom/client";
import type { ComponentType } from "react";
import "./design";

type View = () => Promise<ComponentType>;

// Each window only loads the code for its own view.
const views: Record<string, View> = {
  dock: () => import("./windows/dock/DockWindow").then((m) => m.DockWindow),
  card: () => import("./windows/card/CardWindow").then((m) => m.CardWindow),
  gallery: () => import("./windows/gallery/Gallery").then((m) => m.Gallery),
};

const name = new URLSearchParams(location.search).get("w") ?? "dock";

(views[name] ?? views.dock)().then((View) => {
  createRoot(document.getElementById("root")!).render(<View />);
});
