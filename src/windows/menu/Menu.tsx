import { useSettings } from "../../core/settings";
import { invoke } from "../../core/tauri";
import type { MenuItem } from "../../core/widget";
import "./menu.css";

/** A widget's own items, then the dock's. Read when the menu opens, so the tick is current. */
export function dockMenuItems(widgetItems: MenuItem[] = []): MenuItem[] {
  const { lockDock, update } = useSettings.getState();
  return [
    ...widgetItems,
    { label: "Widgets…", onClick: () => invoke("open_window", { kind: "picker" }).catch(() => {}) },
    { label: "Settings", onClick: () => invoke("open_window", { kind: "settings" }).catch(() => {}) },
    { label: "Lock dock", checked: lockDock, onClick: () => update({ lockDock: !lockDock }) },
    { label: "Quit", onClick: () => invoke("quit").catch(() => {}) },
  ];
}

export function Menu({ items }: { items: MenuItem[] }) {
  return (
    <div className="menu" role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={item.danger ? "menu__row menu__row--danger" : "menu__row"}
          onClick={() => {
            item.onClick();
            invoke("close_card").catch(() => {});
          }}
        >
          <span>{item.label}</span>
          {item.checked && (
            <svg viewBox="0 0 12 12" className="menu__tick" aria-hidden="true">
              <path d="M2 6.500 4.800 9.200 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}
