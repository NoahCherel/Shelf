import { useState } from "react";
import { invoke } from "../../core/tauri";
import { Section } from "./controls";
import { SCHEMA } from "./schema";
import "../picker/picker.css";
import "./settings.css";

export function SettingsWindow() {
  const [pageId, setPageId] = useState(SCHEMA[0].id);
  const page = SCHEMA.find((p) => p.id === pageId) ?? SCHEMA[0];
  return (
    <div className="picker settings">
      <aside className="side" data-tauri-drag-region>
        <h1 className="settings__app" data-tauri-drag-region>
          Settings
        </h1>
        {SCHEMA.map((p) => (
          <button key={p.id} type="button" className={p.id === page.id ? "side__row side__row--on" : "side__row"} onClick={() => setPageId(p.id)}>
            {p.title}
          </button>
        ))}
      </aside>
      <main className="picker__main">
        <header className="picker__head" data-tauri-drag-region>
          <h2 className="picker__title">{page.title}</h2>
          <button type="button" className="card__close picker__close" aria-label="Close" onClick={() => invoke("close_window", { kind: "settings" }).catch(() => {})}>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.500 2.500l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="picker__scroll settings__pane">
          {page.groups.map((group, i) => (
            <Section key={group.title ?? i} section={group} />
          ))}
        </div>
      </main>
    </div>
  );
}
