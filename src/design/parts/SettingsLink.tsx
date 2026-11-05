import { invoke } from "../../core/tauri";
import "./parts.css";

/** For what Shelf can't do itself. It says where it goes, and is never a switch that does nothing. */
export function SettingsLink({ page, label }: { page: string; label: string }) {
  return (
    <button type="button" className="settings-link" onClick={() => invoke("open_settings", { page }).catch(() => {})}>
      {label}
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M3.500 8.500l5-5m0 0H4.500m4 0v4" fill="none" stroke="currentColor" strokeWidth="1.400" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
