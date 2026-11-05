export interface SearchItem {
  id: string;
  name: string;
  kind: "app" | "file" | "search";
  detail?: string | null;
}

const START = 3;
const WORD = 2;
const ANYWHERE = 1;
/** Enough to order items within a kind of match, never enough to change the kind. */
const MOST_OPENS = 999;

function plain(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function matchKind(name: string, query: string): number {
  const text = plain(name);
  if (text.startsWith(query)) return START;
  if (text.split(/[\s\-_.]+/).some((word) => word.startsWith(query))) return WORD;
  return text.includes(query) ? ANYWHERE : 0;
}

/** History is opens by name. An empty query shows only what's been opened. */
export function rank(query: string, items: SearchItem[], history: Record<string, number>): SearchItem[] {
  const wanted = plain(query.trim());
  const opens = (item: SearchItem) => Math.min(history[item.name] ?? 0, MOST_OPENS);
  const score = (item: SearchItem) => (wanted ? matchKind(item.name, wanted) * (MOST_OPENS + 1) + (matchKind(item.name, wanted) ? opens(item) : 0) : opens(item));
  return items
    .map((item) => ({ item, points: score(item) }))
    .filter((row) => row.points > 0)
    .sort((a, b) => b.points - a.points || a.item.name.localeCompare(b.item.name))
    .map((row) => row.item);
}
