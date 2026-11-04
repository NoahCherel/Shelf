import { useEffect, useState } from "react";
import { invoke } from "../../core/tauri";
import type { TileProps } from "../../core/widget";
import "./apps.css";

export interface AppEntry {
  key: string;
  name: string;
  pinned: boolean;
  active: boolean;
  windows: { hwnd: number; title: string }[];
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

const icons = new Map<string, Promise<string | null>>();

function iconFor(key: string): Promise<string | null> {
  let icon = icons.get(key);
  if (!icon) {
    icon = invoke<string | null>("apps_icon", { key }).catch(() => null);
    icons.set(key, icon);
  }
  return icon;
}

function AppIcon({ entry, preview }: { entry: AppEntry; preview?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (preview) return;
    let live = true;
    iconFor(entry.key).then((icon) => live && setSrc(icon));
    return () => {
      live = false;
    };
  }, [entry.key, preview]);
  if (src) return <img className="app__icon" src={src} alt="" draggable={false} />;
  return <span className="app__icon app__icon--blank">{entry.name.charAt(0).toUpperCase()}</span>;
}

function StartLogo() {
  return (
    <svg viewBox="0 0 30 30" className="app__icon" aria-hidden="true">
      <defs>
        <linearGradient id="start-pane" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2f2f4" />
          <stop offset="1" stopColor="#a7a8ad" />
        </linearGradient>
      </defs>
      <rect width="30" height="30" rx="7" fill="#1b1b1d" />
      <rect x="0.5" y="0.5" width="29" height="29" rx="6.5" fill="none" stroke="#ffffff" strokeOpacity="0.14" />
      <g fill="url(#start-pane)">
        <rect x="7.5" y="7.5" width="7" height="7" rx="1" />
        <rect x="15.5" y="7.5" width="7" height="7" rx="1" />
        <rect x="7.5" y="15.5" width="7" height="7" rx="1" />
        <rect x="15.5" y="15.5" width="7" height="7" rx="1" />
      </g>
    </svg>
  );
}

export function AppsTile({ data, preview }: TileProps<AppEntry[]>) {
  const entries = data ?? [];
  return (
    <div className="apps">
      <button
        type="button"
        className="app"
        aria-label="Start"
        title="Start"
        onClick={() => !preview && invoke("start_menu").catch(() => {})}
      >
        <StartLogo />
      </button>
      {entries.map((entry) => (
        <button
          type="button"
          key={entry.key}
          className="app"
          aria-label={entry.name}
          title={entry.windows[0]?.title ?? entry.name}
          onClick={() => !preview && invoke("apps_activate", { key: entry.key }).catch(() => {})}
        >
          <AppIcon entry={entry} preview={preview} />
          {entry.windows.length > 0 && <span className={entry.active ? "app__dot app__dot--active" : "app__dot"} />}
        </button>
      ))}
    </div>
  );
}
