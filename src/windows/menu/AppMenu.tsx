import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "../../core/tauri";
import "./app-menu.css";

type Own = "open" | "pin" | "unpin" | "close" | "close-all";

interface Row {
  /** One of the app's own items, or `jump:<fingerprint>` for a line of a jump list. */
  id: Own | `jump:${string}`;
  label: string;
}

interface Section {
  title: string;
  items: Row[];
}

function Glyph({ id }: { id: Own }) {
  const lines = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (id === "close" || id === "close-all") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" {...lines}>
        <path d="M4.500 4.500l11 11m0-11l-11 11" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...lines}>
      <path d="M12.200 2.800l5 5-1.200 1.200-1-.2-3.300 3.300.2 2.700-1.200 1.200-3.500-3.500-4 4m4-4l-3.500-3.500 1.200-1.200 2.700.2 3.300-3.300-.2-1 1.500-1.400Z" />
      {id === "unpin" && <path d="M3 3l14 14" />}
    </svg>
  );
}

function AppIcon({ appKey, name }: { appKey: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve(invoke<string | null>("apps_icon", { key: appKey })).then(
      (icon) => live && setSrc(icon ?? null),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [appKey]);
  if (src) return <img src={src} alt="" draggable={false} />;
  return <span className="amenu__blank" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>;
}

/** What a Windows taskbar button offers, looking as it does there. Windows' language comes from Rust. */
export function AppMenu({ appKey }: { appKey: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<{ items: Row[]; sections?: Section[] }>("apps_menu", { key: appKey }).then(
      (menu) => {
        setSections(menu.sections ?? []);
        setRows(menu.items);
      },
      () => invoke("close_card").catch(() => {}),
    );
  }, [appKey]);

  const choose = (id: Row["id"]) => {
    invoke("apps_menu_choose", { key: appKey, id })
      .catch(() => {})
      .then(() => invoke("close_card").catch(() => {}));
  };

  const move = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = [...(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[(at + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
  };

  if (rows.length === 0) return null;
  return (
    <div className="amenu" role="menu" ref={box} onKeyDown={move}>
      {sections.map((section) => (
        <div className="amenu__section" key={section.title} role="group" aria-label={section.title}>
          <div className="amenu__title" aria-hidden="true">
            {section.title}
          </div>
          {section.items.map((row) => (
            <button key={row.id} type="button" role="menuitem" className="amenu__row amenu__row--jump" onClick={() => choose(row.id)}>
              <span className="amenu__label">{row.label}</span>
            </button>
          ))}
        </div>
      ))}
      {sections.length > 0 && <hr className="amenu__sep" />}
      {rows.map((row) => (
        <button key={row.id} type="button" role="menuitem" className="amenu__row" onClick={() => choose(row.id)}>
          <span className="amenu__icon">{row.id === "open" ? <AppIcon appKey={appKey} name={row.label} /> : <Glyph id={row.id as Own} />}</span>
          <span className="amenu__label">{row.label}</span>
        </button>
      ))}
    </div>
  );
}
