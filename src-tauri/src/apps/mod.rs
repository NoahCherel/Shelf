//! The Apps widget's data: pins, open windows, icons, and the Start menu.

mod icons;
pub mod jumplist;
pub mod menu;
pub mod merge;
mod pins;
pub mod previews;
mod windows;

use std::collections::HashMap;
use std::sync::Mutex;

use ::windows::core::{w, HSTRING, PCWSTR};
use ::windows::Win32::Globalization::GetUserDefaultUILanguage;
use ::windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use ::windows::Win32::UI::Input::KeyboardAndMouse::{VK_LWIN, VK_X};
use ::windows::Win32::UI::Shell::ShellExecuteW;
use ::windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use menu::Own;
use merge::{click_plan, merge, AppEntry, Click};
use tauri::AppHandle;

use crate::system::tap_keys;

pub use windows::{exe_of_pid, start_is_open, store_string, take_foreground_raw, watch_foreground};

/// Sent once per icon, so the icons aren't copied to the page on every refresh.
static ICONS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
/// The shell's icon lookups aren't dependable when several run at once.
static ONE_LOOKUP: Mutex<()> = Mutex::new(());
static SOURCES: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

/// Shell objects need their own COM apartment, so they get their own short-lived thread.
pub fn on_com_thread<R: Send + 'static>(f: impl FnOnce() -> R + Send + 'static) -> Result<R, String> {
    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        f()
    })
    .join()
    .map_err(|_| "shell call failed".to_string())
}

pub(crate) fn current() -> Result<Vec<AppEntry>, String> {
    let pins = pins::with_overlay(on_com_thread(pins::list)?);
    let entries = pins::arrange(merge(&pins, windows::list(), windows::foreground()), &pins::order());
    let sources = entries.iter().filter_map(|e| Some((e.key.clone(), e.icon_source.clone()?))).collect();
    *SOURCES.lock().unwrap_or_else(|e| e.into_inner()) = Some(sources);
    Ok(entries)
}

#[tauri::command(async)]
pub fn apps_list() -> Result<Vec<AppEntry>, String> {
    current()
}

#[tauri::command(async)]
pub fn apps_icon(key: String) -> Result<Option<String>, String> {
    let _one = ONE_LOOKUP.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(known) = ICONS.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|m| m.get(&key)) {
        return Ok(Some(known.clone()));
    }
    let source = SOURCES.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|m| m.get(&key).cloned());
    let Some(source) = source else { return Ok(None) };
    let icon = on_com_thread(move || icons::icon(&source))?;
    // A miss isn't remembered: the page asks again.
    if let Some(found) = &icon {
        let mut cache = ICONS.lock().unwrap_or_else(|e| e.into_inner());
        cache.get_or_insert_with(HashMap::new).insert(key, found.clone());
    }
    Ok(icon)
}

pub fn bring_forward(raw: isize) {
    windows::focus(raw);
}

/// A program's icon by its path, from the same cache as the apps themselves.
pub fn icon_of_exe(exe: String) -> Result<Option<String>, String> {
    let _one = ONE_LOOKUP.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(known) = ICONS.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|m| m.get(&exe)) {
        return Ok(Some(known.clone()));
    }
    let source = exe.clone();
    let icon = on_com_thread(move || icons::icon(&source))?;
    if let Some(found) = &icon {
        let mut cache = ICONS.lock().unwrap_or_else(|e| e.into_inner());
        cache.get_or_insert_with(HashMap::new).insert(exe, found.clone());
    }
    Ok(icon)
}

#[tauri::command(async)]
pub fn apps_activate(key: String) -> Result<(), String> {
    crate::preview::guard()?;
    let foreground = windows::foreground();
    let entries = current()?;
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
    if menu::should_press_start(windows::start_is_open(), windows::ms_since_start_closed()) {
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
    crate::store::store_save(app, pins::OVERLAY.to_string(), pins::reordered(keys))
}

/// An app dragged off the dock. Only one that's pinned can go, and only from the dock.
#[tauri::command(async)]
pub fn apps_unpin(app: AppHandle, key: String) -> Result<(), String> {
    let entry = current()?.into_iter().find(|e| e.key == key).ok_or("app is gone")?;
    if !entry.pinned {
        return Err("not pinned".into());
    }
    crate::store::store_save(app, pins::OVERLAY.to_string(), pins::unpin(&entry.key))
}

/// Programs and shortcuts dropped on the dock from the desktop or File Explorer are pinned.
/// Folders and other files are left alone for now.
pub fn pin_dropped(app: AppHandle, paths: Vec<std::path::PathBuf>) {
    std::thread::spawn(move || {
        for path in paths {
            let path = path.to_string_lossy().into_owned();
            if let Ok(Some(value)) = on_com_thread(move || pins::pin_dropped(&path)) {
                let _ = crate::store::store_save(app.clone(), pins::OVERLAY.to_string(), value);
            }
        }
        let _ = tauri::Emitter::emit(&app, "apps-changed", ());
    });
}

fn looks_like_path(key: &str) -> bool {
    key.contains('\\') || key.contains('/') || key.ends_with(".exe")
}

/// The jump lists Windows keeps for this app: File Explorer's quick access, a program's tasks, and the
/// recent files of an app with an id of its own. Call on a COM thread.
/// In Windows' order: the program's own categories, its recent files, then its tasks.
fn jump_lists(entry: &AppEntry, lang: u16) -> Vec<(String, Vec<jumplist::Link>)> {
    use jumplist::{section_title, Category, Kind};
    let title = |kind| section_title(kind, lang).to_string();
    if entry.key == "microsoft.windows.explorer" {
        return vec![(title(Kind::QuickAccess), jumplist::quick_access())];
    }
    let program = entry.launch.as_deref().and_then(|launch| {
        if launch.to_lowercase().ends_with(".lnk") {
            pins::link_target(launch)
        } else {
            launch.to_lowercase().ends_with(".exe").then(|| launch.to_string())
        }
    });
    let own = program.map(|exe| jumplist::lists(&exe)).unwrap_or_default();
    let recent = if looks_like_path(&entry.key) { Vec::new() } else { jumplist::recent(&entry.key) };
    let mut out: Vec<(String, Vec<jumplist::Link>)> = own
        .iter()
        .filter_map(|(c, links)| match c {
            Category::Named(name) => Some((name.clone(), links.clone())),
            Category::Tasks => None,
        })
        .collect();
    out.push((title(Kind::Recent), recent));
    out.extend(own.into_iter().filter(|(c, _)| *c == Category::Tasks).map(|(_, links)| (title(Kind::Tasks), links)));
    out
}

/// What right-clicking this app offers, in Windows' language: its jump lists, then its own items.
#[tauri::command(async)]
pub fn apps_menu(key: String) -> Result<menu::AppMenu, String> {
    let entry = current()?.into_iter().find(|e| e.key == key).ok_or("app is gone")?;
    let lang = unsafe { GetUserDefaultUILanguage() };
    let for_lists = entry.clone();
    let lists = on_com_thread(move || jump_lists(&for_lists, lang)).unwrap_or_default();
    Ok(menu::menu_for(&entry, lang, lists))
}

#[tauri::command(async)]
pub fn apps_menu_choose(app: AppHandle, key: String, id: String) -> Result<(), String> {
    crate::preview::guard()?;
    let entry = current()?.into_iter().find(|e| e.key == key).ok_or("app is gone")?;
    // A jump list line runs only if it's still there when read again.
    if let Some(print) = menu::jump_from(&id) {
        let print = print.to_string();
        return on_com_thread(move || {
            let lists = jump_lists(&entry, unsafe { GetUserDefaultUILanguage() });
            let links: Vec<jumplist::Link> = lists.into_iter().flat_map(|(_, links)| links).collect();
            let link = jumplist::find(&links, &print).ok_or("that line is no longer in the list")?;
            jumplist::open(link);
            Ok::<(), String>(())
        })?;
    }
    let choice = menu::own_from(&id).ok_or("unknown choice")?;
    match choice {
        Own::Open => {
            if let Some(path) = &entry.launch {
                unsafe {
                    ShellExecuteW(None, w!("open"), &HSTRING::from(path), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
                }
            }
        }
        Own::Pin => crate::store::store_save(app, pins::OVERLAY.to_string(), pins::pin(&entry))?,
        Own::Unpin => crate::store::store_save(app, pins::OVERLAY.to_string(), pins::unpin(&entry.key))?,
        Own::Close | Own::CloseAll => entry.windows.iter().for_each(|w| windows::close(w.hwnd)),
    }
    Ok(())
}
