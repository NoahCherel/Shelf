import { useEffect } from "react";
import { syncLayout } from "../../core/layout";
import { syncShell } from "../../core/shell";
import { setStyle } from "../../design/theme";
import { DockBar } from "./Bar";

export function DockWindow() {
  useEffect(() => {
    setStyle("black");
    syncLayout();
    syncShell();
  }, []);
  return <DockBar />;
}
