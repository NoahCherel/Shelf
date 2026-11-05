import { useState } from "react";
import { refresh } from "../../core/provider";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import { Card } from "../../design/parts/Card";
import { SettingsLink } from "../../design/parts/SettingsLink";
import { notificationsProvider, type NotificationRow } from "../../widgets/_providers/notifications";
import { statusChanged } from "../index";
import "./notifications.css";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function age(at: number): string {
  const passed = Date.now() - at;
  if (passed < MINUTE) return "now";
  if (passed < HOUR) return `${Math.floor(passed / MINUTE)} min`;
  if (passed < DAY) return `${Math.floor(passed / HOUR)} h`;
  return `${Math.floor(passed / DAY)} d`;
}

export function NotificationsCard() {
  const { data } = useProvider(notificationsProvider);
  const [gone, setGone] = useState<number[]>([]);

  const changed = () => {
    refresh(notificationsProvider);
    statusChanged();
  };

  if (data && !data.access) {
    return (
      <Card title="Notifications" footer={<SettingsLink page="privacy-notifications" label="Notification access" />}>
        <p className="nt__note">Shelf isn't allowed to read your notifications.</p>
      </Card>
    );
  }

  const items = (data?.items ?? []).filter((n) => !gone.includes(n.id));

  const dismiss = (item: NotificationRow) => {
    setGone((ids) => [...ids, item.id]);
    invoke("notification_dismiss", { id: item.id }).then(changed, () => setGone((ids) => ids.filter((id) => id !== item.id)));
  };
  const open = (item: NotificationRow) => {
    invoke("notification_open", { id: item.id }).then(() => {
      changed();
      invoke("close_card").catch(() => {});
    }, () => {});
  };
  const clearAll = () => {
    const ids = items.map((n) => n.id);
    setGone((held) => [...held, ...ids]);
    invoke("notifications_clear").then(changed, () => setGone((held) => held.filter((id) => !ids.includes(id))));
  };

  return (
    <Card
      title="Notifications"
      footer={<SettingsLink page="quiethours" label="Notification settings" />}
      action={items.length > 0 ? { label: "Clear all", onClick: clearAll } : undefined}
    >
      {data && items.length === 0 && <p className="nt__note">No new notifications.</p>}
      {items.length > 0 && (
        <div className="nt__list">
          {items.map((item) => (
            <div key={item.id} className="nt__item" onClick={() => open(item)}>
              <div className="nt__top">
                <span className="nt__app">{item.app}</span>
                <span className="nt__age">{age(item.at)}</span>
                <button
                  type="button"
                  className="nt__dismiss"
                  aria-label={`Dismiss ${item.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss(item);
                  }}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2.500 2.500l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.500" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="nt__title">{item.title}</div>
              {item.body && <div className="nt__body">{item.body}</div>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
