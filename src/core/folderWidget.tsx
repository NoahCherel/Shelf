import { Tile } from "../design/parts/Tile";
import { FolderCard } from "../widgets/_shared/FolderCard";
import { WidgetGlyph } from "../widgets/_shared/WidgetGlyph";
import { isFolderId } from "./folderId";
import { useLayout } from "./layout";
import { defineWidget, widthOf, type WidgetDef } from "./widget";
import "../widgets/_shared/folder.css";

const FOLDER_TILE_T = 48;

function FolderTile({ folderId, resolveWidget }: { folderId: string; resolveWidget: (id: string) => WidgetDef | undefined }) {
  const folder = useLayout((s) => s.folders[folderId]);
  const list = folder?.widgets ?? [];
  const shown = list.slice(0, 4);
  const extra = list.length - shown.length;

  return (
    <Tile width={1} className="wfolder">
      <div className="wfolder__grid" aria-label={folder?.name ?? "Folder"}>
        {shown.map((wid) => {
          const def = resolveWidget(wid);
          return (
            <span key={wid} className="wfolder__cell">
              <WidgetGlyph def={def} />
            </span>
          );
        })}
      </div>
      {extra > 0 && <span className="wfolder__more">+{extra}</span>}
    </Tile>
  );
}

/** Dynamic WidgetDef for a user-created widget folder (`folder:<id>`). */
export function folderWidget(id: string, resolveChild: (childId: string) => WidgetDef | undefined): WidgetDef | undefined {
  if (!isFolderId(id)) return undefined;
  const folder = useLayout.getState().folders[id];
  if (!folder) return undefined;
  const widest = folder.widgets.reduce((max, wid) => {
    const def = resolveChild(wid);
    return Math.max(max, def ? widthOf(def, def.sample ?? null) : 1);
  }, 1);
  const cardWidth = Math.max(320, Math.min(540, Math.ceil(widest * FOLDER_TILE_T) + 32));
  return defineWidget({
    id,
    name: folder.name,
    description: `${folder.widgets.length} widgets in folder`,
    category: "apps-files",
    width: 1,
    cardWidth,
    Tile: () => <FolderTile folderId={id} resolveWidget={resolveChild} />,
    Card: () => <FolderCard folderId={id} resolveWidget={resolveChild} />,
    menu: () => [
      { label: "Ungroup", onClick: () => useLayout.getState().ungroupFolder(id) },
      { label: "Remove folder", danger: true, onClick: () => useLayout.getState().remove(id) },
    ],
  });
}
