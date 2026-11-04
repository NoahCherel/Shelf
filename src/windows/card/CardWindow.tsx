import { useEffect, useRef, useState } from "react";
import { byId } from "../../core/registry";
import { invoke, listen } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import type { WidgetDef } from "../../core/widget";
import "./card-window.css";

const DEFAULT_CARD_WIDTH = 340;

function CardBody({ def }: { def: WidgetDef }) {
  const C = def.Card!;
  const { data, status, error, refresh } = useProvider(def.provider, def.sample);
  const box = useRef<HTMLDivElement>(null);

  // Height fits what the card shows; Rust keeps it on the screen.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      invoke("fit_card", { width: def.cardWidth ?? DEFAULT_CARD_WIDTH, height: el.offsetHeight }).catch(() => {});
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [def]);

  return (
    <div className="card-slide" ref={box}>
      <C data={data} status={status} error={error} refresh={refresh} />
    </div>
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

  const def = shown && byId(shown.id);
  if (!def?.Card) return null;
  return (
    <div className="card-window">
      <CardBody key={shown!.n} def={def} />
    </div>
  );
}
