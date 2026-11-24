import { useMemo, useState } from "react";
import { allWidgetIds, useLayout } from "../../core/layout";
import { byCategory, widgets } from "../../core/registry";
import { invoke } from "../../core/tauri";
import type { Category, WidgetDef } from "../../core/widget";
import { Sidebar } from "./Sidebar";
import { WidgetChoices } from "./AppChoices";
import { WidgetGrid } from "./WidgetGrid";
import "./picker.css";

function matches(def: WidgetDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || def.name.toLowerCase().includes(q) || def.description.toLowerCase().includes(q);
}

export function PickerWindow() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Category | "all">("all");
  const inBar = useLayout((s) => allWidgetIds(s.ids, s.folders).length);

  const groups = useMemo(() => {
    const out = new Map<string, WidgetDef[]>();
    for (const [category, list] of byCategory()) {
      const kept = list.filter((def) => matches(def, query));
      if (kept.length) out.set(category, kept);
    }
    return out;
  }, [query]);

  const select = (category: Category | "all") => {
    setSelected(category);
    if (category === "all") document.querySelector(".picker__scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    else document.getElementById(`section-${category}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="picker">
      <Sidebar query={query} onQuery={setQuery} available={new Set(byCategory().keys())} selected={selected} onSelect={select} />
      <main className="picker__main">
        <header className="picker__head" data-tauri-drag-region>
          <h1 className="picker__title">All Widgets</h1>
          <span className="picker__count" data-testid="count">
            {widgets.length}
          </span>
          <span className="picker__inbar">{inBar} in bar</span>
          <button type="button" className="card__close picker__close" aria-label="Close" onClick={() => invoke("close_window", { kind: "picker" }).catch(() => {})}>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.500 2.500l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="picker__scroll">
          {groups.size > 0 ? <WidgetGrid groups={groups} /> : <p className="picker__none">No widgets match "{query}".</p>}
          <WidgetChoices query={query} />
        </div>
      </main>
    </div>
  );
}
