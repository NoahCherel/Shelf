//! Things dragged onto the dock from Windows: what letting go would do, and keeping what's dropped.

use std::sync::Mutex;

use ::windows::core::{w, HSTRING, PCWSTR};
use ::windows::Win32::UI::Shell::ShellExecuteW;
use ::windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use tauri::AppHandle;

use crate::util::{lock, on_com_thread};

use super::merge::AppKind;
use super::{current, every_entry, icon_of_exe, pins, windows};

/// What letting go of something dragged from Windows would do.
static DRAG_AIM: Mutex<Option<Aim>> = Mutex::new(None);
/// What's being dragged from Windows.
static DRAG_PATHS: Mutex<Vec<std::path::PathBuf>> = Mutex::new(Vec::new());
static DRAG_PINNABLE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[derive(Clone, Debug)]
enum Aim {
    Open(String),
    Place(usize),
}

/// What letting go would do, as the page sees it: open in the app `key`, or take the place `index`.
#[tauri::command]
pub fn apps_drag_target(key: Option<String>, index: Option<usize>) {
    *lock(&DRAG_AIM) = key.map(Aim::Open).or(index.map(Aim::Place));
}

/// A drag from Windows has come onto the dock. Whether it's only programs is decided here, once:
/// asking the disk on every move would stall the drag on a slow drive.
pub fn drag_entered(paths: &[std::path::PathBuf]) {
    let pinnable = paths.iter().all(|p| matches!(pins::dropped(&p.to_string_lossy(), |d| std::path::Path::new(d).is_dir()), pins::Dropped::Program | pins::Dropped::Shortcut));
    DRAG_PINNABLE.store(pinnable, std::sync::atomic::Ordering::Relaxed);
    *lock(&DRAG_PATHS) = paths.to_vec();
}

pub fn drag_is_pinnable() -> bool {
    DRAG_PINNABLE.load(std::sync::atomic::Ordering::Relaxed)
}

/// The picture of what's being dragged, for the place the dock opens for it.
#[tauri::command(async)]
pub fn apps_drag_icon() -> Result<Option<String>, String> {
    let Some(first) = lock(&DRAG_PATHS).first().cloned() else { return Ok(None) };
    icon_of_exe(first.to_string_lossy().into_owned())
}

/// Opens what was dropped on an app's icon with that app.
fn open_in_app(key: &str, paths: &[String]) {
    if crate::preview::guard().is_err() {
        return;
    }
    let launch = every_entry().ok().and_then(|all| all.into_iter().find(|e| e.key == key && e.kind == AppKind::App)).and_then(|e| e.launch);
    let Some(launch) = launch else { return };
    let params = paths.iter().map(|p| format!("\"{p}\"")).collect::<Vec<_>>().join(" ");
    unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from(launch), &HSTRING::from(params), PCWSTR::null(), SW_SHOWNORMAL);
    }
}

/// Something dragged from Windows has stayed over this app: it comes to the front, to be dropped on.
#[tauri::command(async)]
pub fn apps_drag_raise(key: String) -> Result<(), String> {
    crate::preview::guard()?;
    let entry = current()?.into_iter().find(|e| e.key == key).ok_or("app is gone")?;
    if let (false, Some(window)) = (entry.active, entry.windows.first()) {
        windows::focus(window.hwnd);
    }
    Ok(())
}

/// What's dropped on the dock from the desktop or File Explorer is kept on it: programs and
/// shortcuts as apps, the rest as files and folders.
pub fn pin_dropped(app: AppHandle, paths: Vec<std::path::PathBuf>) {
    lock(&DRAG_PATHS).clear();
    let aim = lock(&DRAG_AIM).take();
    let on_icon = matches!(aim, Some(Aim::Open(_)));
    crate::diag::note(&format!("drop on an icon: {on_icon}"));
    std::thread::spawn(move || {
        if let Some(Aim::Open(key)) = &aim {
            let files: Vec<String> = paths
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .filter(|p| matches!(pins::dropped(p, |d| std::path::Path::new(d).is_dir()), pins::Dropped::File | pins::Dropped::Folder))
                .collect();
            open_in_app(key, &files);
        }
        for (offset, path) in paths.into_iter().enumerate() {
            let path = path.to_string_lossy().into_owned();
            let place = match aim {
                Some(Aim::Place(index)) => current().ok().map(|shown| (index + offset, shown.into_iter().map(|e| e.key).collect())),
                _ => None,
            };
            let saving = app.clone();
            let kept = on_com_thread(move || pins::pin_dropped(&saving, &path, on_icon, place));
            crate::diag::note(&format!("drop kept: {}", matches!(kept, Ok(Some(Ok(()))))));
        }
        let _ = tauri::Emitter::emit(&app, "apps-changed", ());
    });
}
