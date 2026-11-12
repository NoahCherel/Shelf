//! The Apps widget's own commands: its list, icons, opening apps, Start, pins, groups and stacks.

use std::collections::HashMap;
use std::sync::Mutex;

use ::windows::core::{w, HSTRING, PCWSTR};
use ::windows::Win32::UI::Shell::ShellExecuteW;
use ::windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use tauri::AppHandle;

use crate::util::{lock, on_com_thread};
use ::windows::Win32::UI::Input::KeyboardAndMouse::{VK_LWIN, VK_X};

use super::merge::{click_plan, AppEntry, AppKind, Click};
use super::{current, every_entry, icons, jumplist, pins, stack, windows};
use crate::system::tap_keys;

/// Sent once per icon, so the icons aren't copied to the page on every refresh.
static ICONS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
/// The shell's icon lookups aren't dependable when several run at once.
static ONE_LOOKUP: Mutex<()> = Mutex::new(());
pub(super) static SOURCES: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

#[tauri::command(async)]
pub fn apps_list() -> Result<Vec<AppEntry>, String> {
    current()
}

#[tauri::command(async)]
pub fn apps_icon(key: String) -> Result<Option<String>, String> {
    let _one = lock(&ONE_LOOKUP);
    if let Some(known) = lock(&ICONS).as_ref().and_then(|m| m.get(&key)) {
        return Ok(Some(known.clone()));
    }
    let source = lock(&SOURCES).as_ref().and_then(|m| m.get(&key).cloned());
    let Some(source) = source else { return Ok(None) };
    let icon = on_com_thread(move || icons::icon(&source))?;
    // A miss isn't remembered: the page asks again.
    if let Some(found) = &icon {
        let mut cache = lock(&ICONS);
        cache.get_or_insert_with(HashMap::new).insert(key, found.clone());
    }
    Ok(icon)
}

pub fn bring_forward(raw: isize) {
    windows::focus(raw);
}

/// The icon of a program, file or folder by its path, from the same cache as the apps themselves.
pub fn icon_of_exe(exe: String) -> Result<Option<String>, String> {
    let _one = lock(&ONE_LOOKUP);
    if let Some(known) = lock(&ICONS).as_ref().and_then(|m| m.get(&exe)) {
        return Ok(Some(known.clone()));
    }
    let source = exe.clone();
    let icon = on_com_thread(move || icons::icon(&source))?;
    if let Some(found) = &icon {
        let mut cache = lock(&ICONS);
        cache.get_or_insert_with(HashMap::new).insert(exe, found.clone());
    }
    Ok(icon)
}

#[tauri::command(async)]
pub fn apps_activate(key: String) -> Result<(), String> {
    crate::preview::guard()?;
    let foreground = windows::foreground();
    let entries = every_entry()?;
    let entry = entries.iter().find(|e| e.key == key).ok_or("app is gone")?;
    match click_plan(entry, foreground) {
        Click::Focus(h) => windows::focus(h),
        Click::Minimize(h) => windows::minimize(h),
        Click::Launch => {
            if let Some(path) = &entry.launch {
                unsafe {
                    ShellExecuteW(None, w!("open"), &HSTRING::from(path), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
                }
            }
        }
    }
    Ok(())
}

/// Opens or closes Start by tapping the Windows key, like the real button. A click on the dock
/// can itself close Start, and then it must stay closed.
#[tauri::command]
pub fn start_menu() -> Result<(), String> {
    crate::preview::guard()?;
    if windows::should_press_start(windows::start_is_open(), windows::ms_since_start_closed()) {
        tap_keys(&[VK_LWIN]);
    }
    Ok(())
}

/// Windows' own quick menu, with Task Manager and the rest: the one Win+X opens.
#[tauri::command]
pub fn start_quick_menu() -> Result<(), String> {
    crate::preview::guard()?;
    tap_keys(&[VK_LWIN, VK_X]);
    Ok(())
}

/// The apps were dragged into a new order. Only Shelf's own file changes, so the preview may do it.
#[tauri::command(async)]
pub fn apps_reorder(app: AppHandle, keys: Vec<String>) -> Result<(), String> {
    pins::reordered(&app, keys)
}

/// Takes this off the dock: a group comes undone, so no app is lost with it.
pub(super) fn taken_off(app: &AppHandle, entry: &AppEntry) -> Result<(), String> {
    match entry.kind {
        AppKind::App => pins::unpin(app, &entry.key),
        AppKind::File | AppKind::Folder => pins::removed_item(app, &entry.key),
        AppKind::Group => pins::ungrouped(app, &entry.key),
    }
}

/// Something dragged off the dock. Only what's pinned can go, and only from the dock.
#[tauri::command(async)]
pub fn apps_unpin(app: AppHandle, key: String) -> Result<(), String> {
    let entry = current()?.into_iter().find(|e| e.key == key).ok_or("app is gone")?;
    if !entry.pinned {
        return Err("not pinned".into());
    }
    taken_off(&app, &entry)
}

/// One app held over another, or over a group.
#[tauri::command(async)]
pub fn apps_group(app: AppHandle, onto: String, dragged: String) -> Result<(), String> {
    let entries = current()?;
    let find = |key: &str| entries.iter().find(|e| e.key == key).ok_or("app is gone");
    let (target, moved) = (find(&onto)?, find(&dragged)?);
    if !pins::can_group(moved, target) {
        return Err("those can't be grouped".into());
    }
    pins::grouped(&app, target, moved)
}

#[tauri::command(async)]
pub fn apps_group_rename(app: AppHandle, key: String, name: String) -> Result<(), String> {
    pins::renamed_group(&app, &key, &name)
}

/// Where a folder on the dock points, only if it's one of the dock's.
fn folder_of(key: &str) -> Result<String, String> {
    current()?.into_iter().find(|e| e.key == key && e.kind == AppKind::Folder).and_then(|e| e.launch).ok_or_else(|| "folder is gone".to_string())
}

#[tauri::command(async)]
pub fn apps_stack(key: String) -> Result<stack::Stack, String> {
    let (found, more) = stack::read(&folder_of(&key)?);
    Ok(stack::stack_of(&found, more))
}

/// The pictures of what a folder holds, each by the id of its line.
#[tauri::command(async)]
pub fn apps_stack_icons(key: String) -> Result<Vec<(String, String)>, String> {
    let (found, _) = stack::read(&folder_of(&key)?);
    Ok(found.iter().filter_map(|f| Some((jumplist::fingerprint(&stack::link_of(f)), icon_of_exe(f.path.clone()).ok()??))).collect())
}

/// A line of a folder runs only if it's still there when read again.
#[tauri::command(async)]
pub fn apps_stack_open(key: String, id: String) -> Result<(), String> {
    crate::preview::guard()?;
    let (found, _) = stack::read(&folder_of(&key)?);
    let links: Vec<jumplist::Link> = found.iter().map(stack::link_of).collect();
    on_com_thread(move || {
        let link = jumplist::find(&links, &id).ok_or("that's no longer in the folder")?;
        jumplist::open(link);
        Ok::<(), String>(())
    })?
}
