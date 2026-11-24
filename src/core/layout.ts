import { create } from "zustand";
import { CATEGORIES } from "./categories";
import { setDockIds } from "./dockIds";
import { canPutInFolder, isFolderId, makeFolderId, type WidgetFolder } from "./folderId";
import { STORE } from "./names";
import { isPinId } from "./pinId";
import { widgets } from "./registry";
import { invoke, listen } from "./tauri";

export const DEFAULT_LAYOUT = ["claude-plan-usage", "apps", "github-activity", "system-status", "clock-and-weather"];

/** Layouts older than this haven't met the status tile, and get it once. Removing it after sticks. */
const VERSION = 2;
const STATUS_TILE = "system-status";

export type { WidgetFolder } from "./folderId";

interface Layout {
  ids: string[];
  /** Where each widget was put on a full-width dock: 0 against the left end, 1 against the right. */
  positions: Record<string, number>;
  /** User-created widget folders on the dock, keyed by `folder:<id>`. */
  folders: Record<string, WidgetFolder>;
  add(id: string): void;
  remove(id: string): void;
  move(from: number, to: number): void;
  /** A widget let go somewhere on a full-width dock, and the order that leaves them in. */
  place(id: string, at: number, order: string[]): void;
  /** Dragged widget dropped onto another widget (creates a folder) or onto an existing folder. */
  groupWidgets(draggedId: string, ontoId: string): void;
  /** Wraps a single widget on the dock into a new folder. */
  createFolderWith(widgetId: string, name?: string): string | null;
  renameFolder(folderId: string, name: string): void;
  reorderInFolder(folderId: string, from: number, to: number): void;
  removeFromFolder(folderId: string, widgetId: string, returnToDock?: boolean, side?: "before" | "after"): void;
  ungroupFolder(folderId: string): void;
  load(): Promise<void>;
}

/** Every active widget id across top-level slots and inside folders (excluding folder ids themselves). */
export function allWidgetIds(ids: string[], folders: Record<string, WidgetFolder> = {}): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (isFolderId(id)) {
      const folder = folders[id];
      if (folder) out.push(...folder.widgets);
    } else {
      out.push(id);
    }
  }
  return out;
}

export function folderContaining(widgetId: string, folders: Record<string, WidgetFolder> = {}): string | null {
  for (const [fid, folder] of Object.entries(folders)) {
    if (folder.widgets.includes(widgetId)) return fid;
  }
  return null;
}

function defaultFolderName(widgetIds: string[]): string {
  const cats = new Set(
    widgetIds
      .map((id) => widgets.find((w) => w.id === id)?.category)
      .filter((c): c is NonNullable<typeof c> => Boolean(c)),
  );
  if (cats.size === 1) {
    const only = [...cats][0];
    const label = CATEGORIES.find((c) => c.id === only)?.label;
    if (label) return label;
  }
  return "Folder";
}

function knownFolders(raw: unknown): Record<string, WidgetFolder> {
  if (typeof raw !== "object" || raw === null) return {};
  const registered = new Set(widgets.map((w) => w.id));
  const out: Record<string, WidgetFolder> = {};
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!isFolderId(id) || typeof entry !== "object" || entry === null) continue;
    const obj = entry as { name?: unknown; widgets?: unknown };
    if (!Array.isArray(obj.widgets)) continue;
    const clean = [...new Set(obj.widgets.filter((w): w is string => typeof w === "string" && canPutInFolder(w) && (registered.has(w) || isPinId(w))))];
    if (clean.length === 0) continue;
    const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim().slice(0, 40) : defaultFolderName(clean);
    out[id] = { name, widgets: clean };
  }
  return out;
}

function known(ids: unknown[], folders: Record<string, WidgetFolder> = {}): string[] {
  const registered = new Set(widgets.map((w) => w.id));
  const inFolder = new Set(Object.values(folders).flatMap((f) => f.widgets));
  const clean = ids.filter(
    (id): id is string =>
      typeof id === "string" &&
      ((isFolderId(id) && Boolean(folders[id]?.widgets.length)) || (!inFolder.has(id) && (registered.has(id) || isPinId(id)))),
  );
  return [...new Set(clean)];
}

function knownPositions(raw: unknown, ids: string[]): Record<string, number> {
  if (typeof raw !== "object" || raw === null) return {};
  const kept = Object.entries(raw).filter((e): e is [string, number] => ids.includes(e[0]) && typeof e[1] === "number" && Number.isFinite(e[1]));
  return Object.fromEntries(kept.map(([id, at]) => [id, Math.min(1, Math.max(0, at))]));
}

function save(ids: string[], positions: Record<string, number>, folders: Record<string, WidgetFolder>) {
  const value = Object.keys(folders).length > 0 ? { version: VERSION, ids, positions, folders } : { version: VERSION, ids, positions };
  invoke("store_save", { name: STORE.layout, value }).catch(() => {});
}

export const useLayout = create<Layout>((set, get) => {
  // Every change saves the positions and folders too, so a window that adds a widget can't drop them.
  const change = (ids: string[], positions = get().positions, folders = get().folders) => {
    const keptFolders = Object.fromEntries(Object.entries(folders).filter(([fid, f]) => ids.includes(fid) && f.widgets.length > 0));
    const keptIds = ids.filter((id) => !isFolderId(id) || Boolean(keptFolders[id]));
    const keptPos = Object.fromEntries(Object.entries(positions).filter(([id]) => keptIds.includes(id)));
    set({ ids: keptIds, positions: keptPos, folders: keptFolders });
    save(keptIds, keptPos, keptFolders);
  };

  return {
    ids: [],
    positions: {},
    folders: {},
    add(id) {
      const { ids, folders } = get();
      if (!allWidgetIds(ids, folders).includes(id) && !ids.includes(id)) {
        change([...ids, id]);
      }
    },
    remove(id) {
      const { ids, folders } = get();
      if (ids.includes(id)) {
        const nextFolders = { ...folders };
        delete nextFolders[id];
        change(
          ids.filter((x) => x !== id),
          get().positions,
          nextFolders,
        );
        return;
      }
      const parent = folderContaining(id, folders);
      if (parent) {
        get().removeFromFolder(parent, id, false);
      }
    },
    move(from, to) {
      const ids = [...get().ids];
      const [item] = ids.splice(from, 1);
      if (item === undefined) return;
      ids.splice(to, 0, item);
      change(ids);
    },
    place(id, at, order) {
      change(known(order, get().folders), { ...get().positions, [id]: Math.min(1, Math.max(0, at)) });
    },
    groupWidgets(draggedId, ontoId) {
      if (draggedId === ontoId || !canPutInFolder(draggedId) || ontoId === "apps") return;
      const { ids, positions, folders } = get();
      const nextFolders: Record<string, WidgetFolder> = { ...folders };

      // Remove draggedId from any previous folder if it lived inside one.
      const prevFolder = folderContaining(draggedId, nextFolders);
      if (prevFolder) {
        nextFolders[prevFolder] = {
          ...nextFolders[prevFolder],
          widgets: nextFolders[prevFolder].widgets.filter((w) => w !== draggedId),
        };
      }

      if (isFolderId(ontoId)) {
        const target = nextFolders[ontoId];
        if (!target || target.widgets.includes(draggedId)) return;
        nextFolders[ontoId] = { ...target, widgets: [...target.widgets, draggedId] };
        const nextIds = ids.filter((x) => x !== draggedId);
        change(nextIds, positions, nextFolders);
        return;
      }

      if (!canPutInFolder(ontoId) || !ids.includes(ontoId)) return;
      const fid = makeFolderId();
      const members = [ontoId, draggedId];
      nextFolders[fid] = { name: defaultFolderName(members), widgets: members };
      const nextIds = ids.filter((x) => x !== draggedId).map((x) => (x === ontoId ? fid : x));
      const nextPos = { ...positions };
      if (ontoId in nextPos) nextPos[fid] = nextPos[ontoId];
      change(nextIds, nextPos, nextFolders);
    },
    createFolderWith(widgetId, name) {
      if (!canPutInFolder(widgetId)) return null;
      const { ids, positions, folders } = get();
      if (!ids.includes(widgetId)) return null;
      const fid = makeFolderId();
      const label = name?.trim() ? name.trim().slice(0, 40) : defaultFolderName([widgetId]);
      const nextFolders = { ...folders, [fid]: { name: label, widgets: [widgetId] } };
      const nextIds = ids.map((x) => (x === widgetId ? fid : x));
      const nextPos = { ...positions };
      if (widgetId in nextPos) nextPos[fid] = nextPos[widgetId];
      change(nextIds, nextPos, nextFolders);
      return fid;
    },
    renameFolder(folderId, name) {
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) return;
      const { ids, positions, folders } = get();
      const folder = folders[folderId];
      if (!folder || folder.name === trimmed) return;
      change(ids, positions, { ...folders, [folderId]: { ...folder, name: trimmed } });
    },
    reorderInFolder(folderId, from, to) {
      const { ids, positions, folders } = get();
      const folder = folders[folderId];
      if (!folder || from === to || from < 0 || to < 0 || from >= folder.widgets.length || to >= folder.widgets.length) return;
      const nextWidgets = [...folder.widgets];
      const [item] = nextWidgets.splice(from, 1);
      if (item === undefined) return;
      nextWidgets.splice(to, 0, item);
      change(ids, positions, { ...folders, [folderId]: { ...folder, widgets: nextWidgets } });
    },
    removeFromFolder(folderId, widgetId, returnToDock = false, side = "after") {
      const { ids, positions, folders } = get();
      const folder = folders[folderId];
      if (!folder || !folder.widgets.includes(widgetId)) return;
      const remaining = folder.widgets.filter((w) => w !== widgetId);
      const nextFolders = { ...folders };
      let nextIds = [...ids];
      if (remaining.length === 0) {
        delete nextFolders[folderId];
        if (returnToDock) {
          nextIds = nextIds.map((x) => (x === folderId ? widgetId : x));
        } else {
          nextIds = nextIds.filter((x) => x !== folderId);
        }
      } else {
        nextFolders[folderId] = { ...folder, widgets: remaining };
        if (returnToDock && !nextIds.includes(widgetId)) {
          const at = nextIds.indexOf(folderId);
          if (at >= 0) nextIds.splice(side === "before" ? at : at + 1, 0, widgetId);
          else nextIds.push(widgetId);
        }
      }
      change(nextIds, positions, nextFolders);
    },
    ungroupFolder(folderId) {
      const { ids, positions, folders } = get();
      const folder = folders[folderId];
      if (!folder) return;
      const at = ids.indexOf(folderId);
      const nextIds = [...ids];
      if (at >= 0) {
        nextIds.splice(at, 1, ...folder.widgets);
      } else {
        nextIds.push(...folder.widgets);
      }
      const nextFolders = { ...folders };
      delete nextFolders[folderId];
      change(nextIds, positions, nextFolders);
    },
    async load() {
      const saved = (await invoke("store_load", { name: STORE.layout }).catch(() => null)) as {
        ids?: unknown;
        version?: number;
        positions?: unknown;
        folders?: unknown;
      } | null;
      // A missing or broken file gets the default; ids that no longer exist just drop out.
      if (!Array.isArray(saved?.ids)) {
        set({ ids: known(DEFAULT_LAYOUT), positions: {}, folders: {} });
        return;
      }
      const folders = knownFolders(saved.folders);
      const outdated = (saved.version ?? 1) < VERSION;
      const ids = known(outdated ? [...saved.ids, STATUS_TILE] : saved.ids, folders);
      const keptFolders = Object.fromEntries(Object.entries(folders).filter(([fid]) => ids.includes(fid)));
      set({ ids, positions: knownPositions(saved.positions, ids), folders: keptFolders });
    },
  };
});

useLayout.subscribe((layout) => setDockIds(allWidgetIds(layout.ids, layout.folders)));

/** Loads the layout and follows changes made in other windows. */
export function syncLayout(): void {
  useLayout.getState().load();
  listen<string>("store-changed", (name) => {
    if (name === STORE.layout) useLayout.getState().load();
  });
}
