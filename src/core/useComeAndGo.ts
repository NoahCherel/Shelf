import { useEffect, useRef, useState } from "react";

/** As long as the fold in the stylesheets that use it. */
const FOLD_MS = 300;

export interface Gone<T> {
  item: T;
  index: number;
  /** What `measure` said it took up, for a fold that starts from its real width. */
  width: number;
}

/**
 * Things that have turned up since the list first showed, which open up, and things just gone, kept
 * where they were for the moment they take to fold away. `items` is null until there is a list to
 * compare with, and `still` shows the list as it is, like the picker's samples. Used by the dock's
 * widgets and by the apps in the Apps widget.
 */
export function useComeAndGo<T>(items: T[] | null | undefined, keyOf: (item: T) => string, measure?: (key: string) => number, still = false) {
  const [, redraw] = useState(0);
  const last = useRef<T[] | null>(null);
  const arrived = useRef(new Set<string>());
  const leaving = useRef(new Map<string, Gone<T>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  if (items && !still && last.current !== items) {
    const now = new Set(items.map(keyOf));
    const before = last.current;
    if (before) {
      const was = new Set(before.map(keyOf));
      for (const key of now) if (!was.has(key)) arrived.current.add(key);
      before.forEach((item, index) => {
        const key = keyOf(item);
        if (now.has(key) || leaving.current.has(key)) return;
        leaving.current.set(key, { item, index, width: measure?.(key) ?? 0 });
      });
    }
    for (const key of now) leaving.current.delete(key);
    for (const key of arrived.current) if (!now.has(key)) arrived.current.delete(key);
    last.current = items;
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

  const rows = [...(items ?? [])];
  [...leaving.current.values()]
    .sort((a, b) => a.index - b.index)
    .forEach(({ item, index }) => rows.splice(Math.min(index, rows.length), 0, item));
  return { rows, arrived: arrived.current, leaving: leaving.current };
}
