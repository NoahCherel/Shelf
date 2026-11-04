import type { Category } from "../../core/widget";
import { CATEGORIES } from "../../core/categories";

interface SidebarProps {
  query: string;
  onQuery: (query: string) => void;
  available: Set<Category>;
  selected: Category | "all";
  onSelect: (category: Category | "all") => void;
}

export function Sidebar({ query, onQuery, available, selected, onSelect }: SidebarProps) {
  const row = (id: Category | "all", label: string, color: string) => (
    <button
      key={id}
      type="button"
      className={selected === id ? "side__row side__row--on" : "side__row"}
      onClick={() => onSelect(id)}
    >
      <i className="side__icon" style={{ background: color }} aria-hidden="true" />
      {label}
    </button>
  );
  return (
    <aside className="side" data-tauri-drag-region>
      <input className="side__search" placeholder="Search widgets" spellCheck={false} value={query} onChange={(e) => onQuery(e.target.value)} />
      {row("all", "All Widgets", "#0a84ff")}
      {CATEGORIES.filter((c) => available.has(c.id)).map((c) => row(c.id, c.label, c.color))}
    </aside>
  );
}
