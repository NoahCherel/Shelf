import { useEffect, useRef, useState, type ReactNode } from "react";
import { CARD } from "../../core/names";
import { refresh } from "../../core/provider";
import { byId } from "../../core/registry";
import { invoke, listen } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import type { WidgetDef } from "../../core/widget";
import { panels, type PanelId } from "../../panels";
import { AppMenu } from "../menu/AppMenu";
import { GroupCard } from "../menu/GroupCard";
import { StackCard } from "../menu/StackCard";
import { dockMenuItems, Menu } from "../menu/Menu";
import "./card-window.css";

const DEFAULT_CARD_WIDTH = 340;
const MENU_WIDTH = 210;

/**
 * The size to give the window, or null while there's nothing to show yet. A window sized to nothing
 * makes WebView2 put its page to sleep, and a sleeping page never measures what arrives next: an
 * app's menu, empty until its rows came, stayed invisible, then showed the last app's on the next click.
 */
export function fitFor(width: number | undefined, contentWidth: number, contentHeight: number): { width: number; height: number } | null {
  const w = width ?? contentWidth;
  return w > 0 && contentHeight > 0 ? { width: w, height: contentHeight } : null;
}

/** Height fits what's shown; Rust keeps it on the screen. */
/** With no width, the card window takes the content's own width. */
function Fitted({ width, children }: { width?: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    invoke<number | null>("card_room").then(
      (room) => room && document.documentElement.style.setProperty("--card-max", `${room}px`),
      () => {},
    );
    const observer = new ResizeObserver(() => {
      const size = fitFor(width, el.offsetWidth, el.offsetHeight);
      if (size) invoke("fit_card", size).catch(() => {});
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div className={width === undefined ? "card-slide card-slide--snug" : "card-slide"} ref={box}>
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
  if (id.startsWith(CARD.panel)) {
    const panel = panels[id.slice(CARD.panel.length) as PanelId];
    if (!panel) return null;
    return (
      <div className="card-window">
        <Fitted key={n} width={panel.width}>
          <panel.Card />
        </Fitted>
      </div>
    );
  }
  if (id.startsWith(CARD.appMenu)) {
    return (
      <div className="card-window">
        <Fitted key={n}>
          <AppMenu appKey={id.slice(CARD.appMenu.length)} />
        </Fitted>
      </div>
    );
  }
  if (id.startsWith(CARD.group) || id.startsWith(CARD.stack)) {
    return (
      <div className="card-window">
        <Fitted key={n}>
          {id.startsWith(CARD.group) ? <GroupCard groupKey={id.slice(CARD.group.length)} /> : <StackCard folderKey={id.slice(CARD.stack.length)} />}
        </Fitted>
      </div>
    );
  }
  if (id.startsWith(CARD.menu)) {
    return (
      <div className="card-window">
        <MenuBody key={n} def={byId(id.slice(CARD.menu.length))} />
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
    // For the diagnostic trace: whether WebView2 thinks this window can be seen.
    const onVisibility = () => invoke("diag_note", { what: `card page ${document.visibilityState}` }).catch(() => {});
    document.addEventListener("visibilitychange", onVisibility);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") invoke("close_card").catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off.then((stop) => stop());
      offClosed.then((stop) => stop());
      window.removeEventListener("focus", catchUp);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return shown && <CardContent id={shown.id} n={shown.n} />;
}
