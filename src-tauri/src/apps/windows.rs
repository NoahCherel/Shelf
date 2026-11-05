//! Open top-level windows, the same set the taskbar would show.

use std::collections::HashMap;
use std::ffi::c_void;
use std::mem::size_of;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use tauri::{AppHandle, Emitter};
use windows::core::{BOOL, GUID, PWSTR, w, HSTRING};
use windows::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::System::Threading::{
    AttachThreadInput, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::Foundation::PROPERTYKEY;
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, EnumWindows, GetWindowPlacement, PostMessageW, WINDOWPLACEMENT, WM_CLOSE, GetForegroundWindow, GetWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, EVENT_SYSTEM_FOREGROUND,
    GWL_EXSTYLE, GW_OWNER, SW_MINIMIZE, SW_RESTORE, WINEVENT_OUTOFCONTEXT, WS_EX_APPWINDOW,
    WS_EX_TOOLWINDOW,
};

use super::menu::is_start_host;
use super::merge::{title_from_utf16, RawWindow, useful_description};

pub const APP_ID_KEY: PROPERTYKEY =
    PROPERTYKEY { fmtid: GUID::from_u128(0x9F4C2855_9F79_4B39_A8D0_E1D42DE1D5F3), pid: 5 };
const VT_LPWSTR: u16 = 31;

/// Last foreground window that wasn't ours: clicking the dock steals focus,
/// so this is what was active just before.
static LAST_FOREGROUND: AtomicIsize = AtomicIsize::new(0);
static HANDLE: OnceLock<AppHandle> = OnceLock::new();
static START_OPEN: AtomicBool = AtomicBool::new(false);
static START_CLOSED: Mutex<Option<Instant>> = Mutex::new(None);
/// A window's program and app id don't change, and reading them isn't free.
static KNOWN: Mutex<Option<HashMap<isize, (String, Option<String>, Option<String>)>>> = Mutex::new(None);

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
    let start = !h.is_invalid() && is_start_host(&exe_path(window_pid(h)));
    let was_open = START_OPEN.swap(start, Ordering::Relaxed);
    if was_open && !start {
        *START_CLOSED.lock().unwrap_or_else(|e| e.into_inner()) = Some(Instant::now());
    }
    if let Some(app) = HANDLE.get() {
        if was_open != start {
            let _ = app.emit("start-open", start);
        }
        if window_pid(h) != std::process::id() {
            let _ = app.emit("provider-refresh", "apps");
        }
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
            WINEVENT_OUTOFCONTEXT,
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

/// The name in a program's version information.
fn file_description(exe: &str) -> Option<String> {
    let path = HSTRING::from(exe);
    unsafe {
        let size = GetFileVersionInfoSizeW(&path, None);
        if size == 0 {
            return None;
        }
        let mut info = vec![0u8; size as usize];
        GetFileVersionInfoW(&path, None, size, info.as_mut_ptr() as *mut c_void).ok()?;
        let block = info.as_ptr() as *const c_void;
        let (mut found, mut length) = (std::ptr::null_mut(), 0u32);
        if !VerQueryValueW(block, w!("\\VarFileInfo\\Translation"), &mut found, &mut length).as_bool() || length < 4 {
            return None;
        }
        let codes = found as *const u16;
        let (language, page) = (*codes, *codes.add(1));
        let wanted = HSTRING::from(format!("\\StringFileInfo\\{language:04x}{page:04x}\\FileDescription"));
        if !VerQueryValueW(block, &wanted, &mut found, &mut length).as_bool() || length == 0 {
            return None;
        }
        let text = std::slice::from_raw_parts(found as *const u16, length as usize);
        let end = text.iter().position(|c| *c == 0).unwrap_or(text.len());
        Some(String::from_utf16_lossy(&text[..end]))
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
            let (exe, id, description) = old.get(&raw).cloned().unwrap_or_else(|| {
                let exe = exe_path(window_pid(h));
                let description = useful_description(file_description(&exe));
                (exe, app_id(h), description)
            });
            known.insert(raw, (exe.clone(), id.clone(), description.clone()));
            RawWindow { description, hwnd: raw, title: window_title(h), exe, app_id: id }
        })
        .collect();
    *guard = Some(known);
    out
}

/// Windows refuses to let a background process take focus, which is what the dock is unless it
/// was just clicked. Sharing input with the window that has focus lifts that refusal.
unsafe fn take_foreground(h: HWND) {
    if SetForegroundWindow(h).as_bool() && GetForegroundWindow() == h {
        return;
    }
    let current = GetForegroundWindow();
    let holder = GetWindowThreadProcessId(current, None);
    let ours = GetCurrentThreadId();
    let attached = holder != 0 && holder != ours && AttachThreadInput(ours, holder, true).as_bool();
    let _ = BringWindowToTop(h);
    let _ = SetForegroundWindow(h);
    if attached {
        let _ = AttachThreadInput(ours, holder, false);
    }
}

pub fn take_foreground_raw(raw: isize) {
    if raw != 0 {
        unsafe { take_foreground(hwnd(raw)) };
    }
}

pub fn exe_of_pid(pid: u32) -> String {
    exe_path(pid)
}

pub fn start_is_open() -> bool {
    let h = unsafe { GetForegroundWindow() };
    !h.is_invalid() && is_start_host(&exe_path(window_pid(h)))
}

pub fn ms_since_start_closed() -> Option<u64> {
    START_CLOSED.lock().unwrap_or_else(|e| e.into_inner()).map(|at| at.elapsed().as_millis() as u64)
}

pub fn focus(raw: isize) {
    let h = hwnd(raw);
    unsafe {
        if IsIconic(h).as_bool() {
            let _ = ShowWindow(h, SW_RESTORE);
        }
        take_foreground(h);
    }
    LAST_FOREGROUND.store(raw, Ordering::Relaxed);
}

pub fn is_minimized(raw: isize) -> bool {
    unsafe { IsIconic(hwnd(raw)).as_bool() }
}

/// Its size when not minimized.
pub fn normal_size(raw: isize) -> (i32, i32) {
    let mut placement = WINDOWPLACEMENT { length: size_of::<WINDOWPLACEMENT>() as u32, ..Default::default() };
    if unsafe { GetWindowPlacement(hwnd(raw), &mut placement) }.is_err() {
        return (0, 0);
    }
    let r = placement.rcNormalPosition;
    (r.right - r.left, r.bottom - r.top)
}

/// Asks, as the window's own close button does, so it can still offer to save.
pub fn close(raw: isize) {
    unsafe {
        let _ = PostMessageW(Some(hwnd(raw)), WM_CLOSE, WPARAM(0), LPARAM(0));
    }
}

pub fn minimize(raw: isize) {
    unsafe {
        let _ = ShowWindow(hwnd(raw), SW_MINIMIZE);
    }
    LAST_FOREGROUND.store(0, Ordering::Relaxed);
}
