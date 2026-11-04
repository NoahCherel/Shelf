//! The Apps widget's data: pins, open windows, icons, and the Start menu.

mod icons;
mod merge;
mod pins;
mod windows;

use std::collections::HashMap;
use std::mem::size_of;
use std::sync::Mutex;

use ::windows::core::{w, HSTRING, PCWSTR};
use ::windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use ::windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_LWIN,
};
use ::windows::Win32::UI::Shell::ShellExecuteW;
use ::windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use merge::{click_plan, merge, AppEntry, Click};

pub use windows::watch_foreground;

/// Sent once per icon, so the icons aren't copied to the page on every refresh.
static ICONS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
/// The shell's icon lookups aren't dependable when several run at once.
static ONE_LOOKUP: Mutex<()> = Mutex::new(());
static SOURCES: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

/// Shell objects need their own COM apartment, so they get their own short-lived thread.
fn on_com_thread<R: Send + 'static>(f: impl FnOnce() -> R + Send + 'static) -> Result<R, String> {
    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        f()
    })
    .join()
    .map_err(|_| "shell call failed".to_string())
}

fn current() -> Result<Vec<AppEntry>, String> {
    let pins = on_com_thread(pins::list)?;
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

#[tauri::command(async)]
pub fn apps_activate(key: String) -> Result<(), String> {
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

/// Opens the Start menu by tapping the Windows key.
#[tauri::command]
pub fn start_menu() {
    let key = |flags| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VK_LWIN, dwFlags: flags, ..Default::default() } },
    };
    let inputs = [key(Default::default()), key(KEYEVENTF_KEYUP)];
    unsafe {
        SendInput(&inputs, size_of::<INPUT>() as i32);
    }
}
