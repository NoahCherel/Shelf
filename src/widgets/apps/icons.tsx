import { useEffect, useState } from "react";
import { STORE } from "../../core/names";
import { validStartImage } from "../../core/startImage";
import { invoke, listen } from "../../core/tauri";
import type { AppEntry } from "./entry";

const ICON_RETRY_MS = 2500;
const ICON_TRIES = 6;

const icons = new Map<string, Promise<string | null>>();

function iconFor(key: string): Promise<string | null> {
  let icon = icons.get(key);
  if (!icon) {
    icon = invoke<string | null>("apps_icon", { key }).catch(() => null);
    icons.set(key, icon);
    // Only found icons are kept, so a miss can be asked again.
    icon.then((found) => found || icons.delete(key));
  }
  return icon;
}

export function AppIcon({ entry, preview }: { entry: AppEntry; preview?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (preview) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    const attempt = () => {
      iconFor(entry.key).then((icon) => {
        if (!live) return;
        if (icon) setSrc(icon);
        else if (++tries < ICON_TRIES) timer = setTimeout(attempt, ICON_RETRY_MS);
      });
    };
    attempt();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [entry.key, preview]);
  if (src) return <img className="app__icon" src={src} alt="" draggable={false} />;
  return <span className="app__icon app__icon--blank">{entry.name.charAt(0).toUpperCase()}</span>;
}

/** A group's tile: a few of its apps in miniature. */
export function GroupIcon({ entry, preview }: { entry: AppEntry; preview?: boolean }) {
  return (
    <span className="app__icon app__group">
      {(entry.members ?? []).slice(0, 4).map((member) => (
        <span className="app__mini" key={member.key}>
          <AppIcon entry={member} preview={preview} />
        </span>
      ))}
    </span>
  );
}

export function SearchGlyph() {
  return (
    <svg viewBox="0 0 30 30" className="app__icon app__icon--search" aria-hidden="true">
      <circle cx="13.500" cy="13.500" r="7.500" fill="none" stroke="currentColor" strokeWidth="2.600" />
      <path d="M19.300 19.300 25 25" stroke="currentColor" strokeWidth="2.800" strokeLinecap="round" />
    </svg>
  );
}

/** The picture chosen for Start, if any, kept up to date from Settings. */
export function useStartImage(preview?: boolean): string | null {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (preview) return;
    let live = true;
    const load = () =>
      Promise.resolve(invoke<{ data?: unknown } | null>("store_load", { name: STORE.startImage })).then(
        (saved) => live && setImage(validStartImage(saved?.data) ? saved!.data as string : null),
        () => {},
      );
    load();
    const off = listen<string>("store-changed", (name) => {
      if (name === STORE.startImage) load();
    });
    return () => {
      live = false;
      off.then((stop) => stop());
    };
  }, [preview]);
  return image;
}

export function StartLogo() {
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
