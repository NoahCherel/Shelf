import type { Provider } from "../../core/widget";

const LOCALE = "en-GB";

export interface TimeParts {
  time: string;
  seconds: string;
  suffix: string;
}

export function timeParts(ms: number, hour24: boolean): TimeParts {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = d.getHours();
  const shown = hour24 ? pad(hours) : String(hours % 12 || 12);
  return {
    time: `${shown}:${pad(d.getMinutes())}`,
    seconds: pad(d.getSeconds()),
    suffix: hour24 ? "" : hours < 12 ? "AM" : "PM",
  };
}

export function dateParts(ms: number) {
  const d = new Date(ms);
  const name = (opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(LOCALE, opts);
  return {
    weekday: name({ weekday: "long" }),
    weekdayShort: name({ weekday: "short" }),
    day: d.getDate(),
    month: name({ month: "short" }),
  };
}

export interface Month {
  title: string;
  /** Monday first; null pads the start. */
  cells: (number | null)[];
  today: number;
}

export function buildMonth(now: Date): Month {
  const year = now.getFullYear();
  const month = now.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  return {
    title: now.toLocaleDateString(LOCALE, { month: "long", year: "numeric" }),
    cells: [...Array<null>(leading).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)],
    today: now.getDate(),
  };
}

export const clockProvider: Provider<number> = {
  id: "clock",
  intervalMs: 1000,
  cache: false,
  fetch: async () => Date.now(),
};

/** Same tick, but its value only changes on the minute, so tiles redraw once a minute. */
export const minuteProvider: Provider<number> = {
  id: "clock-minute",
  intervalMs: 1000,
  cache: false,
  fetch: async () => Math.floor(Date.now() / 60_000) * 60_000,
};
