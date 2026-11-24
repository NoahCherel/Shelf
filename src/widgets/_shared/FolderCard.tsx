import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { DRAG_DISTANCE } from "../../core/gestures";
import { useLayout } from "../../core/layout";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import type { WidgetDef } from "../../core/widget";
import { openPanel } from "../../panels/open";
import "./folder.css";

const PULL_OUT_MARGIN = 6;

interface FolderCardProps {
  folderId: string;
  resolveWidget: (id: string) => WidgetDef | undefined;
}

interface DragState {
  id: string;
  dx: number;
  dy: number;
  outside: boolean;
  overId: string | null;
}

function LiveChildTile({
  def,
  drag,
  dropTarget,
  onGrab,
  onOpen,
  onMoveOut,
  onRemove,
}: {
  def: WidgetDef;
  drag: DragState | null;
  dropTarget: boolean;
  onGrab: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onOpen: (e: MouseEvent<HTMLDivElement>) => void;
  onMoveOut: () => void;
  onRemove: () => void;
}) {
  const T = def.Tile;
  const { data, status, error, refresh } = useProvider(def.provider, def.sample, true);
  const dragging = drag?.id === def.id;

  return (
    <div
      className="wfolder-card__item"
      data-folder-widget={def.id}
      data-dragging={dragging || undefined}
      data-pulling-out={(dragging && drag.outside) || undefined}
      data-drop-target={dropTarget || undefined}
      style={dragging ? { transform: `translate3d(${drag.dx}px, ${drag.dy}px, 0)` } : undefined}
      onPointerDown={onGrab}
    >
      <div className="wfolder-card__tile" onClick={onOpen} title={def.name}>
        <T data={data} status={status} error={error} refresh={refresh} />
      </div>
      <div className="wfolder-card__actions">
        <button
          type="button"
          className="wfolder-card__btn"
          aria-label={`Move ${def.name} to dock`}
          title="Move to dock"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onMoveOut();
          }}
        >
          ↗
        </button>
        <button
          type="button"
          className="wfolder-card__btn wfolder-card__btn--danger"
          aria-label={`Remove ${def.name}`}
          title="Remove"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function ChildDetailCard({ def, folderName, onBack }: { def: WidgetDef; folderName: string; onBack: () => void }) {
  const C = def.Card!;
  const { data, status, error, refresh } = useProvider(def.provider, def.sample, true);
  return (
    <div className="wfolder-detail">
      <button type="button" className="wfolder-detail__back" onClick={onBack}>
        ← {folderName}
      </button>
      <C data={data} status={status} error={error} refresh={refresh} />
    </div>
  );
}

export function FolderCard({ folderId, resolveWidget }: FolderCardProps) {
  const folder = useLayout((s) => s.folders[folderId]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!folder) invoke("close_card").catch(() => {});
  }, [folder]);

  if (!folder) return null;

  if (activeId && folder.widgets.includes(activeId)) {
    const child = resolveWidget(activeId);
    if (child?.Card) {
      return <ChildDetailCard def={child} folderName={folder.name} onBack={() => setActiveId(null)} />;
    }
  }

  const rename = (value: string) => {
    useLayout.getState().renameFolder(folderId, value);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  const grab = (wid: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Snapshot sibling rects once so hit-testing stays rock-solid while dragging.
    const itemRects = new Map<string, DOMRect>();
    listRef.current?.querySelectorAll<HTMLElement>("[data-folder-widget]").forEach((node) => {
      const id = node.dataset.folderWidget;
      if (id && id !== wid) itemRects.set(id, node.getBoundingClientRect());
    });

    let moved = false;
    let lastOutside = false;
    let lastSide: "before" | "after" = "after";
    let lastOverId: string | null = null;

    const hitItem = (x: number, y: number): string | null => {
      for (const [id, r] of itemRects) {
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
      }
      return null;
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };

    const onMove = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_DISTANCE) return;
      if (!moved) {
        moved = true;
        try {
          el.setPointerCapture?.(pointerId);
        } catch {
          // Ignore in synthetic test environments without an active pointer.
        }
      }
      const outside =
        ev.clientX < rect.left - PULL_OUT_MARGIN ||
        ev.clientX > rect.right + PULL_OUT_MARGIN ||
        ev.clientY < rect.top - PULL_OUT_MARGIN ||
        ev.clientY > rect.bottom + PULL_OUT_MARGIN;
      lastOutside = outside;
      lastSide = ev.clientX < rect.left + rect.width / 2 ? "before" : "after";
      lastOverId = outside ? null : hitItem(ev.clientX, ev.clientY);
      setDrag({ id: wid, dx, dy, outside, overId: lastOverId });
    };

    const onCancel = () => {
      cleanup();
      setDrag(null);
    };

    const onUp = () => {
      cleanup();
      setDrag(null);
      if (!moved) return;

      // Prevent the click that immediately follows pointerup from opening the child's card.
      const swallow = (click: Event) => {
        click.stopPropagation();
        click.preventDefault();
      };
      el.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 0);

      if (lastOutside) {
        useLayout.getState().removeFromFolder(folderId, wid, true, lastSide);
      } else if (lastOverId) {
        const list = useLayout.getState().folders[folderId]?.widgets ?? [];
        const from = list.indexOf(wid);
        const to = list.indexOf(lastOverId);
        if (from >= 0 && to >= 0 && from !== to) {
          useLayout.getState().reorderInFolder(folderId, from, to);
        }
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onCancel, { once: true });
  };

  const pullingOut = Boolean(drag?.outside);

  return (
    <div
      className="wfolder-card"
      ref={cardRef}
      data-dragging={drag ? "true" : undefined}
      data-pulling-out={pullingOut ? "true" : undefined}
    >
      <div className="wfolder-card__head">
        <input
          className="wfolder-card__name"
          aria-label="Folder name"
          defaultValue={folder.name}
          key={folder.name}
          maxLength={40}
          spellCheck={false}
          onKeyDown={onKey}
          onBlur={(e) => rename(e.currentTarget.value)}
        />
        {pullingOut ? (
          <span className="wfolder-card__pull-pill">Drop to move to dock</span>
        ) : (
          <>
            <span className="wfolder-card__count">{folder.widgets.length}</span>
            <button
              type="button"
              className="wfolder-card__ungroup"
              onClick={() => {
                useLayout.getState().ungroupFolder(folderId);
                invoke("close_card").catch(() => {});
              }}
            >
              Ungroup
            </button>
          </>
        )}
      </div>
      <div className="wfolder-card__list" ref={listRef}>
        {folder.widgets.map((wid) => {
          const def = resolveWidget(wid);
          if (!def) return null;
          return (
            <LiveChildTile
              key={wid}
              def={def}
              drag={drag}
              dropTarget={drag?.overId === wid}
              onGrab={grab(wid)}
              onOpen={(e) => {
                if (def.panel) {
                  openPanel(def.panel, e.currentTarget);
                } else if (def.Card) {
                  setActiveId(def.id);
                }
              }}
              onMoveOut={() => useLayout.getState().removeFromFolder(folderId, wid, true)}
              onRemove={() => useLayout.getState().removeFromFolder(folderId, wid, false)}
            />
          );
        })}
      </div>
    </div>
  );
}
