import { useEffect, useRef, type MouseEvent } from "react";
import { byId } from "../../core/registry";
import { useLayout } from "../../core/layout";
import { useShell } from "../../core/shell";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import type { WidgetDef } from "../../core/widget";
import "./dock.css";

const DEFAULT_CARD_WIDTH = 340;
const DEFAULT_CARD_HEIGHT = 300;

/** Space under the bar, inside the window. */
const GAP_BELOW = 17;

function Slot({ def }: { def: WidgetDef }) {
  const T = def.Tile;
  const { data, status, error, refresh } = useProvider(def.provider, def.sample);
  const openCard = (e: MouseEvent<HTMLDivElement>) => {
    if (!def.Card) return;
    const r = e.currentTarget.getBoundingClientRect();
    invoke("open_card", {
      widgetId: def.id,
      tileX: r.left,
      tileWidth: r.width,
      width: def.cardWidth ?? DEFAULT_CARD_WIDTH,
      height: def.cardHeight ?? DEFAULT_CARD_HEIGHT,
    }).catch(() => {});
  };
  return (
    <div className={def.id === "apps" ? "slot slot--shrink" : "slot"} data-widget-id={def.id} data-status={status} onClick={openCard}>
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
