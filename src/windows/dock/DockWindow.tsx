import { useEffect } from "react";
import { syncLayout } from "../../core/layout";
import { syncShell } from "../../core/shell";
import { DockBar } from "./Bar";

export function DockWindow() {
  useEffect(() => {
    syncLayout();
    syncShell();
  }, []);
  return <DockBar />;
}
