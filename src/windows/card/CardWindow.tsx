import { useEffect, useRef, useState, type ReactNode } from "react";
import { refresh } from "../../core/provider";
import { byId } from "../../core/registry";
import { invoke, listen } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import type { WidgetDef } from "../../core/widget";
import { panels, type PanelId } from "../../panels";
import { dockMenuItems, Menu } from "../menu/Menu";
import "./card-window.css";

const DEFAULT_CARD_WIDTH = 340;
const MENU_WIDTH = 210;
const MENU_PREFIX = "__menu:";
const PANEL_PREFIX = "__panel:";

/** Height fits what's shown; Rust keeps it on the screen. */
function Fitted({ width, children }: { width: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    invoke<number | null>("card_room").then(
      (room) => room && document.documentElement.style.setProperty("--card-max", `${room}px`),
      () => {},
    );
    const observer = new ResizeObserver(() => {
      invoke("fit_card", { width, height: el.offsetHeight }).catch(() => {});
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div className="card-slide" ref={box}>
      {children}
    </div>
  );
}

function CardBody({ def }: { def: WidgetDef }) {
  const C = def.Card!;
  const { data, status, error, refresh: reload } = useProvider(def.provider, def.sample);
  return (
    <Fitted width={def.cardWidth ?? DEFAULT_CARD_WIDTH}>
      <C data={data} status={status} error={error} refresh={reload} />
    </Fitted>
  );
}

function MenuBody({ def }: { def: WidgetDef | undefined }) {
  const own = def?.menu?.({ refresh: () => def.provider && refresh(def.provider) }) ?? [];
  return (
    <Fitted width={MENU_WIDTH}>
      <Menu items={dockMenuItems(own)} />
    </Fitted>
  );
}

/** What the card window shows for an id: a widget's card or a menu. */
export function CardContent({ id, n }: { id: string; n: number }) {
  if (id.startsWith(PANEL_PREFIX)) {
    const panel = panels[id.slice(PANEL_PREFIX.length) as PanelId];
    if (!panel) return null;
    return (
      <div className="card-window">
        <Fitted key={n} width={panel.width}>
          <panel.Card />
        </Fitted>
      </div>
    );
  }
  if (id.startsWith(MENU_PREFIX)) {
    return (
      <div className="card-window">
        <MenuBody key={n} def={byId(id.slice(MENU_PREFIX.length))} />
      </div>
    );
  }
  const def = byId(id);
  if (!def?.Card) return null;
  return (
    <div className="card-window">
      <CardBody key={n} def={def} />
    </div>
  );
}

export function CardWindow() {
  // `shown` changes on every open, so the slide replays.
  const [shown, setShown] = useState<{ id: string; n: number } | null>(null);

  useEffect(() => {
    let n = 0;
    let current: string | null = null;
    const show = (id: string) => {
      current = id;
      setShown({ id, n: ++n });
    };
    // Catches up if the window was asked to open before this page had loaded.
    const catchUp = () => {
      invoke<string | null>("card_current")
        .then((id) => {
          if (id && id !== current) show(id);
          current = id;
        })
        .catch(() => {});
    };
    const off = listen<string>("card-open", show);
    off.then(catchUp);
    // Unmounting is what stops a closed card's providers and drops anything typed into it.
    const offClosed = listen("card-closed", () => {
      current = null;
      setShown(null);
    });
    window.addEventListener("focus", catchUp);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") invoke("close_card").catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off.then((stop) => stop());
      offClosed.then((stop) => stop());
      window.removeEventListener("focus", catchUp);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return shown && <CardContent id={shown.id} n={shown.n} />;
}
