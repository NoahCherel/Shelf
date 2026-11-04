//! Open top-level windows, the same set the taskbar would show.

use std::collections::HashMap;
use std::ffi::c_void;
use std::mem::size_of;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Emitter};
use windows::core::{BOOL, GUID, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::Foundation::PROPERTYKEY;
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, EVENT_SYSTEM_FOREGROUND,
    GWL_EXSTYLE, GW_OWNER, SW_MINIMIZE, SW_RESTORE, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS, WS_EX_APPWINDOW,
    WS_EX_TOOLWINDOW,
};

use super::merge::{title_from_utf16, RawWindow};

pub const APP_ID_KEY: PROPERTYKEY =
    PROPERTYKEY { fmtid: GUID::from_u128(0x9F4C2855_9F79_4B39_A8D0_E1D42DE1D5F3), pid: 5 };
const VT_LPWSTR: u16 = 31;

/// Last foreground window that wasn't ours: clicking the dock steals focus,
/// so this is what was active just before.
static LAST_FOREGROUND: AtomicIsize = AtomicIsize::new(0);
static HANDLE: OnceLock<AppHandle> = OnceLock::new();
/// A window's program and app id don't change, and reading them isn't free.
static KNOWN: Mutex<Option<HashMap<isize, (String, Option<String>)>>> = Mutex::new(None);

fn hwnd(raw: isize) -> HWND {
    HWND(raw as *mut c_void)
}

fn window_pid(h: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(h, Some(&mut pid));
    }
    pid
}

fn remember(h: HWND) {
    if !h.is_invalid() && window_pid(h) != std::process::id() {
        LAST_FOREGROUND.store(h.0 as isize, Ordering::Relaxed);
    }
}

pub fn foreground() -> isize {
    remember(unsafe { GetForegroundWindow() });
    LAST_FOREGROUND.load(Ordering::Relaxed)
}

unsafe extern "system" fn on_foreground(
    _hook: HWINEVENTHOOK,
    _event: u32,
    h: HWND,
    _object: i32,
    _child: i32,
    _thread: u32,
    _time: u32,
) {
    remember(h);
    if let Some(app) = HANDLE.get() {
        let _ = app.emit("provider-refresh", "apps");
    }
}

/// Tracks focus as it happens, instead of noticing on the next poll.
/// Runs on the main thread, whose message loop delivers the events.
pub fn watch_foreground(app: &AppHandle) {
    let _ = HANDLE.set(app.clone());
    unsafe {
        SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            Some(on_foreground),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );
    }
}

unsafe extern "system" fn collect(h: HWND, lparam: LPARAM) -> BOOL {
    let list = &mut *(lparam.0 as *mut Vec<HWND>);
    list.push(h);
    BOOL(1)
}

fn is_app_window(h: HWND) -> bool {
    unsafe {
        if !IsWindowVisible(h).as_bool() {
            return false;
        }
        if let Ok(owner) = GetWindow(h, GW_OWNER) {
            if !owner.is_invalid() {
                return false;
            }
        }
        let ex = GetWindowLongPtrW(h, GWL_EXSTYLE) as u32;
        if ex & WS_EX_TOOLWINDOW.0 != 0 && ex & WS_EX_APPWINDOW.0 == 0 {
            return false;
        }
        let mut cloaked: u32 = 0;
        if DwmGetWindowAttribute(h, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut c_void, size_of::<u32>() as u32)
            .is_ok()
            && cloaked != 0
        {
            return false;
        }
        if GetWindowTextLengthW(h) == 0 {
            return false;
        }
    }
    window_pid(h) != std::process::id()
}

fn window_title(h: HWND) -> String {
    let mut buf = [0u16; 512];
    let n = unsafe { GetWindowTextW(h, &mut buf) };
    title_from_utf16(&buf[..n.max(0) as usize])
}

fn exe_path(pid: u32) -> String {
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return String::new();
        };
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
        let _ = CloseHandle(handle);
        if ok {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    }
}

/// Reads a string property, or None when it's unset.
pub fn store_string(store: &IPropertyStore, key: &PROPERTYKEY) -> Option<String> {
    unsafe {
        let value = store.GetValue(key).ok()?;
        let inner = &value.Anonymous.Anonymous;
        if inner.vt.0 != VT_LPWSTR {
            return None;
        }
        inner.Anonymous.pwszVal.to_string().ok().filter(|s| !s.is_empty())
    }
}

fn app_id(h: HWND) -> Option<String> {
    let store: IPropertyStore = unsafe { SHGetPropertyStoreForWindow(h).ok()? };
    store_string(&store, &APP_ID_KEY)
}

pub fn list() -> Vec<RawWindow> {
    let mut handles: Vec<HWND> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut handles as *mut Vec<HWND> as isize));
    }
    let mut guard = KNOWN.lock().unwrap_or_else(|e| e.into_inner());
    let old = guard.take().unwrap_or_default();
    let mut known = HashMap::new();
    let out = handles
        .into_iter()
        .filter(|h| is_app_window(*h))
        .map(|h| {
            let raw = h.0 as isize;
            let (exe, id) = old.get(&raw).cloned().unwrap_or_else(|| (exe_path(window_pid(h)), app_id(h)));
            known.insert(raw, (exe.clone(), id.clone()));
            RawWindow { hwnd: raw, title: window_title(h), exe, app_id: id }
        })
        .collect();
    *guard = Some(known);
    out
}

pub fn focus(raw: isize) {
    let h = hwnd(raw);
    unsafe {
        if IsIconic(h).as_bool() {
            let _ = ShowWindow(h, SW_RESTORE);
        }
        let _ = SetForegroundWindow(h);
    }
    LAST_FOREGROUND.store(raw, Ordering::Relaxed);
}

pub fn minimize(raw: isize) {
    unsafe {
        let _ = ShowWindow(hwnd(raw), SW_MINIMIZE);
    }
    LAST_FOREGROUND.store(0, Ordering::Relaxed);
}
