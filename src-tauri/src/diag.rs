//! A trace of what cards and previews do, for chasing a problem only the real pointer shows.
//! Off unless Shelf starts with SHELF_DIAG=1; it then appends to diag.log beside the saved data.
//! It records what Shelf does and which program is in front, never window titles or keystrokes.

use std::io::Write;
use std::sync::LazyLock;
use std::time::Instant;

use tauri::{AppHandle, Manager};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId, IsIconic, IsWindowVisible};

static ON: LazyLock<bool> = LazyLock::new(|| std::env::var("SHELF_DIAG").is_ok_and(|v| v == "1"));
static START: LazyLock<Instant> = LazyLock::new(Instant::now);

static APP: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();

/// Lets the trace name which of Shelf's windows is in front.
pub fn remember(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

fn program_in_front() -> String {
    let mut pid = 0u32;
    let front = unsafe { GetForegroundWindow() };
    unsafe { GetWindowThreadProcessId(front, Some(&mut pid)) };
    if pid == std::process::id() {
        let label = APP.get().and_then(|app| {
            app.webview_windows().into_iter().find(|(_, w)| w.hwnd().is_ok_and(|h| h.0 == front.0)).map(|(label, _)| label)
        });
        return format!("shelf {}", label.unwrap_or_else(|| "(not a window of its own)".into()));
    }
    let exe = crate::apps::exe_of_pid(pid);
    exe.rsplit(['\\', '/']).next().unwrap_or(&exe).to_string()
}

/// Notes one thing Shelf did. Cheap and silent when off.
pub fn note(what: &str) {
    if !*ON {
        return;
    }
    let line = format!("{:>8} ms  {what}  (front: {})\n", START.elapsed().as_millis(), program_in_front());
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(crate::store::app_dir().join("diag.log")) {
        let _ = file.write_all(line.as_bytes());
    }
}

/// Lets a page add to the trace, such as the card window being told it's hidden.
#[tauri::command]
pub fn diag_note(what: String) {
    note(&what.chars().take(200).collect::<String>());
}

/// How Windows itself sees the card window: shown or not, minimized or not.
pub fn card_window_state() -> String {
    let Some(card) = APP.get().and_then(|app| app.get_webview_window("card")) else { return "no card window".into() };
    let Ok(h) = card.hwnd() else { return "no handle".into() };
    let h = HWND(h.0);
    unsafe { format!("card window visible {}, minimized {}", IsWindowVisible(h).as_bool(), IsIconic(h).as_bool()) }
}
