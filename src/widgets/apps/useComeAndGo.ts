import { useEffect, useRef, useState } from "react";
import type { AppEntry } from "./entry";

/** As long as the fold in apps.css. */
const FOLD_MS = 300;

/** Apps that have turned up since the dock first loaded, for as long as they stay. */
export function useArrivals(entries: AppEntry[] | null, preview?: boolean): Set<string> {
  const known = useRef<Set<string> | null>(null);
  const arrived = useRef(new Set<string>());
  if (entries && !preview) {
    const now = new Set(entries.map((e) => e.key));
    for (const key of now) if (known.current && !known.current.has(key)) arrived.current.add(key);
    for (const key of arrived.current) if (!now.has(key)) arrived.current.delete(key);
    known.current = now;
  }
  return arrived.current;
}

/** Apps just gone, kept where they were for the moment they take to fold away. */
export function useLeaving(entries: AppEntry[] | null, preview?: boolean): AppEntry[] {
  const [, redraw] = useState(0);
  const last = useRef<AppEntry[] | null>(null);
  const leaving = useRef(new Map<string, { entry: AppEntry; index: number }>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  if (entries && !preview) {
    const now = new Set(entries.map((e) => e.key));
    last.current?.forEach((entry, index) => {
      if (!now.has(entry.key)) leaving.current.set(entry.key, { entry, index });
    });
    for (const key of now) leaving.current.delete(key);
    last.current = entries;
  }

  useEffect(() => {
    for (const [key, timer] of timers.current) {
      if (!leaving.current.has(key)) {
        clearTimeout(timer);
        timers.current.delete(key);
      }
    }
    for (const key of leaving.current.keys()) {
      if (timers.current.has(key)) continue;
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          leaving.current.delete(key);
          redraw((n) => n + 1);
        }, FOLD_MS),
      );
    }
  });

  useEffect(() => {
    const running = timers.current;
    return () => {
      running.forEach(clearTimeout);
      running.clear();
    };
  }, []);

  const rows = [...(entries ?? [])];
  [...leaving.current.values()]
    .sort((a, b) => a.index - b.index)
    .forEach(({ entry, index }) => rows.splice(Math.min(index, rows.length), 0, entry));
  return rows;
}
