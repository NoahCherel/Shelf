import { useEffect, useRef, useState, type ReactNode } from "react";
import { refresh } from "../../core/provider";
import { byId } from "../../core/registry";
import { invoke, listen } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import type { WidgetDef } from "../../core/widget";
import { dockMenuItems, Menu } from "../menu/Menu";
import "./card-window.css";

const DEFAULT_CARD_WIDTH = 340;
const MENU_WIDTH = 210;
const MENU_PREFIX = "__menu:";

/** Height fits what's shown; Rust keeps it on the screen. */
function Fitted({ width, children }: { width: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
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

export function CardWindow() {
  // `shown` changes on every open, so the slide replays.
  const [shown, setShown] = useState<{ id: string; n: number } | null>(null);

  useEffect(() => {
    let n = 0;
    invoke<string | null>("card_current")
      .then((id) => id && setShown({ id, n: ++n }))
      .catch(() => {});
    const off = listen<string>("card-open", (id) => setShown({ id, n: ++n }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") invoke("close_card").catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off.then((stop) => stop());
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!shown) return null;
  if (shown.id.startsWith(MENU_PREFIX)) {
    return (
      <div className="card-window">
        <MenuBody key={shown.n} def={byId(shown.id.slice(MENU_PREFIX.length))} />
      </div>
    );
  }
  const def = byId(shown.id);
  if (!def?.Card) return null;
  return (
    <div className="card-window">
      <CardBody key={shown.n} def={def} />
    </div>
  );
}
