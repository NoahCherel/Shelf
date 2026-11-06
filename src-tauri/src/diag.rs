//! A trace of what cards and previews do, for chasing a problem only the real pointer shows.
//! Off unless Shelf starts with SHELF_DIAG=1; it then appends to diag.log beside the saved data.
//! It records what Shelf does and which program is in front, never window titles or keystrokes.

use std::io::Write;
use std::sync::LazyLock;
use std::time::Instant;

use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

static ON: LazyLock<bool> = LazyLock::new(|| std::env::var("SHELF_DIAG").is_ok_and(|v| v == "1"));
static START: LazyLock<Instant> = LazyLock::new(Instant::now);

fn program_in_front() -> String {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(GetForegroundWindow(), Some(&mut pid)) };
    if pid == std::process::id() {
        return "shelf".into();
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
