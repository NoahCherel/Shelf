import { useEffect, useState } from "react";
import { invoke } from "../../core/tauri";
import "./app-menu.css";
import "./dock-cards.css";

interface Row {
  id: string;
  label: string;
  folder: boolean;
}

const close = () => invoke("close_card").catch(() => {});

/** What a folder on the dock holds. A line is opened by its id, which Rust looks up again. */
export function StackCard({ folderKey }: { folderKey: string }) {
  const [stack, setStack] = useState<{ items: Row[]; more: boolean } | null>(null);
  const [icons, setIcons] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    invoke<{ items: Row[]; more: boolean }>("apps_stack", { key: folderKey }).then(
      (found) => {
        if (!found) return void close();
        setStack(found);
        // The pictures come after, so the list shows straight away.
        Promise.resolve(invoke<[string, string][]>("apps_stack_icons", { key: folderKey })).then(
          (pictures) => setIcons(new Map(pictures ?? [])),
          () => {},
        );
      },
      () => void close(),
    );
  }, [folderKey]);

  const open = (id: string) => {
    invoke("apps_stack_open", { key: folderKey, id })
      .catch(() => {})
      .then(close);
  };
  const openFolder = () => {
    invoke("apps_menu_choose", { key: folderKey, id: "open" })
      .catch(() => {})
      .then(close);
  };

  if (!stack) return null;
  return (
    <div className="amenu dcard-stack" role="menu">
      <div className="dcard-stack__list">
        {stack.items.length === 0 && <div className="amenu__title">This folder is empty</div>}
        {stack.items.map((row) => (
          <button key={row.id} type="button" role="menuitem" className="amenu__row" title={row.label} onClick={() => open(row.id)}>
            <span className="amenu__icon">{icons.get(row.id) ? <img src={icons.get(row.id)} alt="" draggable={false} /> : <span className="amenu__placeholder" aria-hidden="true" />}</span>
            <span className="amenu__label">{row.label}</span>
          </button>
        ))}
      </div>
      <hr className="amenu__sep" />
      <button type="button" role="menuitem" className="amenu__row" onClick={openFolder}>
        <span className="amenu__icon">
          <span className="amenu__placeholder" aria-hidden="true" />
        </span>
        <span className="amenu__label">{stack.more ? "Open folder to see more" : "Open folder"}</span>
      </button>
    </div>
  );
}
