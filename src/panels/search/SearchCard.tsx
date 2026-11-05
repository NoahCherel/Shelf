import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "../../core/tauri";
import { rank, type SearchItem } from "./rank";
import "./search.css";

const TYPING_PAUSE_MS = 150;
const SHORTEST_FILE_QUERY = 2;
const MOST_APPS = 6;
const MOST_FILES = 6;
const MOST_RECENT = 8;
const HISTORY = "search-history";
const WEB_ID = "web";

/** Rust keeps the highest ticket it has seen, so these have to outlive the card. */
let lastTicket = 0;

function ItemIcon({ item }: { item: SearchItem }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve(invoke<string | null>("search_icon", { id: item.id })).then(
      (icon) => live && setSrc(icon ?? null),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [item.id]);
  if (src) return <img className="search__icon" src={src} alt="" draggable={false} />;
  return <span className="search__icon search__icon--blank">{item.name.charAt(0).toUpperCase()}</span>;
}

const WEB_ICON = (
  <span className="search__icon search__icon--blank">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.800" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </svg>
  </span>
);

export function SearchCard() {
  const [query, setQuery] = useState("");
  const [apps, setApps] = useState<SearchItem[]>([]);
  const [files, setFiles] = useState<SearchItem[]>([]);
  const [history, setHistory] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  const ticket = useRef(0);
  const text = query.trim();

  useEffect(() => {
    box.current?.focus();
    invoke<SearchItem[]>("search_apps").then((list) => setApps(list ?? []), () => {});
    invoke<Record<string, number> | null>("store_load", { name: HISTORY }).then((saved) => setHistory(saved ?? {}), () => {});
  }, []);

  useEffect(() => {
    const mine = ++lastTicket;
    ticket.current = mine;
    if (text.length < SHORTEST_FILE_QUERY) {
      setFiles([]);
      return;
    }
    const timer = setTimeout(() => {
      invoke<SearchItem[]>("search_files", { query: text, ticket: mine }).then(
        (found) => {
          if (ticket.current === mine) setFiles(found ?? []);
        },
        () => {
          if (ticket.current === mine) setFiles([]);
        },
      );
    }, TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const matches = text
    ? [...rank(text, apps, history).slice(0, MOST_APPS), ...rank(text, files, history).slice(0, MOST_FILES)]
    : rank("", apps, history).slice(0, MOST_RECENT);
  const web: SearchItem | null = text ? { id: WEB_ID, name: `Search the web for “${text}”`, kind: "app" } : null;
  const rows = web ? [...matches, web] : matches;
  const current = Math.min(selected, Math.max(rows.length - 1, 0));

  const open = (row: SearchItem) => {
    const opening = row.id === WEB_ID ? invoke("search_web", { query: text }) : invoke("search_open", { id: row.id });
    opening.then(
      () => {
        if (row.id !== WEB_ID) {
          const value = { ...history, [row.name]: (history[row.name] ?? 0) + 1 };
          setHistory(value);
          invoke("store_save", { name: HISTORY, value }).catch(() => {});
        }
        invoke("close_card").catch(() => {});
      },
      () => {},
    );
  };

  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" && rows.length) setSelected((current + 1) % rows.length);
    else if (e.key === "ArrowUp" && rows.length) setSelected((current - 1 + rows.length) % rows.length);
    else if (e.key === "Enter" && rows[current]) open(rows[current]);
    else return;
    e.preventDefault();
  };

  return (
    <section className="card search">
      <div className="search__box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="10.500" cy="10.500" r="6.500" />
          <path d="M15.500 15.500 20 20" />
        </svg>
        <input
          ref={box}
          type="text"
          aria-label="Search"
          placeholder="Search apps, files and the web"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={key}
        />
      </div>
      {rows.length > 0 && (
        <div className="search__list" role="listbox" aria-label="Results">
          {rows.map((row, i) => (
            <div
              key={row.id}
              role="option"
              aria-selected={i === current}
              className={i === current ? "search__row search__row--on" : "search__row"}
              onMouseEnter={() => setSelected(i)}
              onClick={() => open(row)}
            >
              {row.id === WEB_ID ? WEB_ICON : <ItemIcon item={row} />}
              <span className="search__name">{row.name}</span>
              {row.detail && <span className="search__detail">{row.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
