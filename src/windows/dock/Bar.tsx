import { useEffect, useRef } from "react";
import { byId } from "../../core/registry";
import { useLayout } from "../../core/layout";
import { useShell } from "../../core/shell";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import type { WidgetDef } from "../../core/widget";
import "./dock.css";

/** Space under the bar, inside the window. */
const GAP_BELOW = 17;

function Slot({ def }: { def: WidgetDef }) {
  const T = def.Tile;
  const { data, status, error, refresh } = useProvider(def.provider, def.sample);
  return (
    <div className={def.id === "apps" ? "slot slot--shrink" : "slot"} data-widget-id={def.id} data-status={status}>
      <T data={data} status={status} error={error} refresh={refresh} />
    </div>
  );
}

export function DockBar() {
  const ids = useLayout((s) => s.ids);
  const fullscreen = useShell((s) => s.fullscreen);
  const bar = useRef<HTMLDivElement>(null);

  // Keeps the window exactly as wide as the bar. The bar sizes itself to its content,
  // independent of the window, so this can't feed back into itself.
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      invoke("set_dock_width", { width, height: Math.ceil(height + GAP_BELOW) }).catch(() => {});
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // Limited by the screen, not the window, which is always only as wide as the bar.
    <div className="dock" data-testid="bar" ref={bar} style={{ maxWidth: window.screen.width }}>
      {!fullscreen &&
        ids.map((id) => {
          const def = byId(id);
          return def ? <Slot key={id} def={def} /> : null;
        })}
    </div>
  );
}
