//! The Apps widget's data: pins, open windows, icons, and the Start menu.

mod icons;
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

pub use windows::{exe_of_pid, store_string, take_foreground_raw, watch_foreground};

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
    let entries = merge(&pins, windows::list(), windows::foreground());
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

/// What right-clicking this app offers, in Windows' language.
#[tauri::command(async)]
pub fn apps_menu(key: String) -> Result<menu::AppMenu, String> {
    let entry = current()?.into_iter().find(|e| e.key == key).ok_or("app is gone")?;
    Ok(menu::menu_for(&entry, unsafe { GetUserDefaultUILanguage() }))
}

#[tauri::command(async)]
pub fn apps_menu_choose(app: AppHandle, key: String, id: String) -> Result<(), String> {
    crate::preview::guard()?;
    let choice = menu::own_from(&id).ok_or("unknown choice")?;
    let entry = current()?.into_iter().find(|e| e.key == key).ok_or("app is gone")?;
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
