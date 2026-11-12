export interface AppEntry {
  key: string;
  name: string;
  pinned: boolean;
  active: boolean;
  windows: { hwnd: number; title: string }[];
  /** An app when absent. */
  kind?: "app" | "file" | "folder" | "group";
  /** A group's apps. */
  members?: AppEntry[];
}

/** Keeps icons where they are as focus changes; new apps go last, closed ones drop out. */
export function stableOrder(previous: AppEntry[], next: AppEntry[]): AppEntry[] {
  const byKey = new Map(next.map((e) => [e.key, e]));
  const kept = previous.flatMap((e) => {
    const current = byKey.get(e.key);
    return current ? [current] : [];
  });
  const known = new Set(previous.map((e) => e.key));
  return [...kept, ...next.filter((e) => !known.has(e.key))];
}

let reordered = false;

/** The apps were just dragged into a new order, so the next list from Rust is taken as it comes. */
export function markReordered(): void {
  reordered = true;
}

export function takeReordered(): boolean {
  const was = reordered;
  reordered = false;
  return was;
}
