import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "../../core/tauri";
import type { AppEntry } from "../../widgets/apps/Tile";
import { AppIcon } from "./AppIcon";
import "./dock-cards.css";

const close = () => invoke("close_card").catch(() => {});

/** The apps of a group, under a name that can be edited. */
export function GroupCard({ groupKey, onMenu }: { groupKey: string; onMenu: (appKey: string) => void }) {
  const [group, setGroup] = useState<AppEntry | null>(null);
  const saved = useRef("");

  useEffect(() => {
    invoke<AppEntry[]>("apps_list").then(
      (entries) => {
        const found = entries?.find((e) => e.key === groupKey);
        if (!found) return void close();
        saved.current = found.name;
        setGroup(found);
      },
      () => void close(),
    );
  }, [groupKey]);

  const rename = (name: string) => {
    if (!name.trim() || name === saved.current) return;
    saved.current = name;
    invoke("apps_group_rename", { key: groupKey, name }).catch(() => {});
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  if (!group) return null;
  return (
    <div className="amenu dcard-group">
      <input className="dcard-group__name" aria-label="Group name" defaultValue={group.name} maxLength={40} spellCheck={false} onKeyDown={onKey} onBlur={(e) => rename(e.currentTarget.value)} />
      <div className="dcard-group__apps">
        {(group.members ?? []).map((member) => (
          <button
            key={member.key}
            type="button"
            className="dcard-group__app"
            aria-label={member.name}
            title={member.name}
            onClick={() => {
              invoke("apps_activate", { key: member.key })
                .catch(() => {})
                .then(close);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              onMenu(member.key);
            }}
          >
            <span className="dcard-group__icon">
              <AppIcon appKey={member.key} name={member.name} />
            </span>
            <span className="dcard-group__label">{member.name}</span>
            {member.windows.length > 0 && <span className="dcard-group__dot" />}
          </button>
        ))}
      </div>
    </div>
  );
}
