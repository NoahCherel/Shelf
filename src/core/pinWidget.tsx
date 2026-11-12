import { useEffect, useState } from "react";
import type { AppEntry } from "../widgets/apps/Tile";
import { useLayout } from "./layout";
import { parsePin, type Pinned } from "./pinId";
import { invoke } from "./tauri";
import { defineWidget, type Provider, type TileProps, type WidgetDef } from "./widget";

/** How often a tile checks that what it opens still exists. */
const CHECK_MS = 60_000;

/** The dock's entry for this app: by its id, or by its program for one listed under a known folder. */
export function appFor(target: string, entries: AppEntry[]): AppEntry | undefined {
  const lower = target.toLowerCase();
  const tail = lower.includes("}") ? lower.slice(lower.indexOf("}") + 1).replace(/\//g, "\\") : null;
  return entries.flatMap((e) => [e, ...(e.members ?? [])]).find((e) => e.key === lower || (tail !== null && e.key.endsWith(tail)));
}

function lastPart(target: string): string {
  return target.split("/").filter(Boolean).pop() ?? target;
}

function PinTile({ id, pinned, data, preview }: { id: string; pinned: Pinned } & TileProps<AppEntry[]>) {
  const [icon, setIcon] = useState<string | null>(null);
  const [name, setName] = useState(lastPart(pinned.target));

  useEffect(() => {
    if (preview) return;
    let live = true;
    Promise.resolve(invoke<string | null>("pin_widget_icon", { id })).then((found) => live && setIcon(found ?? null), () => {});
    const check = () =>
      Promise.resolve(invoke<{ name: string; gone: boolean } | null>("pin_widget_info", { id })).then(
        (info) => {
          if (!live || !info) return;
          if (info.gone) useLayout.getState().remove(id);
          else if (info.name) setName(info.name);
        },
        () => {},
      );
    check();
    const timer = setInterval(check, CHECK_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id, preview]);

  const running = pinned.kind === "app" ? appFor(pinned.target, data ?? []) : undefined;
  const open = () => {
    if (preview) return;
    if (running?.windows.length) invoke("apps_activate", { key: running.key }).catch(() => {});
    else invoke("pin_widget_open", { id }).catch(() => {});
  };
  return (
    <button type="button" className={running?.active ? "app app--active" : "app"} aria-label={name} title={name} onClick={open}>
      {icon ? <img className="app__icon" src={icon} alt="" draggable={false} /> : <span className="app__icon app__icon--blank">{name.charAt(0).toUpperCase()}</span>}
      {!!running?.windows.length && <span className="app__dot" />}
    </button>
  );
}

const made = new Map<string, WidgetDef>();

/** The widget for an app or folder. It reads the list the Apps widget already keeps up to date. */
export function pinWidget(id: string, apps: Provider<AppEntry[]> | undefined): WidgetDef | undefined {
  const pinned = parsePin(id);
  if (!pinned) return undefined;
  let def = made.get(id);
  if (!def) {
    def = defineWidget<AppEntry[]>({
      id,
      name: lastPart(pinned.target),
      description: pinned.kind === "app" ? "An app of yours." : "A folder of yours.",
      category: "apps-files",
      width: 0.96,
      provider: apps,
      Tile: (props) => <PinTile id={id} pinned={pinned} {...props} />,
    });
    made.set(id, def);
  }
  return def;
}
