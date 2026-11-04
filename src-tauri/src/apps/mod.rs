//! Open windows, their icons, and the Start menu.

use std::collections::HashMap;
use std::ffi::c_void;
use std::mem::size_of;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::{LazyLock, Mutex};

use base64::Engine;
use serde::Serialize;
use windows::core::{BOOL, PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_LWIN,
};
use windows::Win32::UI::Shell::ExtractIconExW;
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, EnumWindows, GetForegroundWindow, GetIconInfo, GetWindow, GetWindowLongPtrW, GetWindowTextLengthW,
    GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, PrivateExtractIconsW, SetForegroundWindow,
    ShowWindow, GWL_EXSTYLE, GW_OWNER, HICON, ICONINFO, SW_MINIMIZE, SW_RESTORE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

/// Last foreground window that wasn't ours (clicking the dock steals focus,
/// so we remember what was active just before).
static LAST_FOREGROUND: AtomicIsize = AtomicIsize::new(0);
static ICON_CACHE: LazyLock<Mutex<HashMap<String, Option<String>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn hwnd(raw: isize) -> HWND {
    HWND(raw as *mut c_void)
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn own_pid() -> u32 {
    std::process::id()
}

#[derive(Serialize, Clone)]
pub struct WinInfo {
    pub hwnd: isize,
    pub title: String,
    pub exe: String,
    pub icon: Option<String>,
    pub active: bool,
}

unsafe extern "system" fn collect(h: HWND, lparam: LPARAM) -> BOOL {
    let list = &mut *(lparam.0 as *mut Vec<HWND>);
    list.push(h);
    BOOL(1)
}

fn window_pid(h: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(h, Some(&mut pid));
    }
    pid
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
        if DwmGetWindowAttribute(
            h,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut c_void,
            size_of::<u32>() as u32,
        )
        .is_ok()
            && cloaked != 0
        {
            return false;
        }
        if GetWindowTextLengthW(h) == 0 {
            return false;
        }
    }
    window_pid(h) != own_pid()
}

fn window_title(h: HWND) -> String {
    let mut buf = [0u16; 512];
    let n = unsafe { GetWindowTextW(h, &mut buf) };
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

fn exe_path(pid: u32) -> String {
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return String::new();
        };
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
        .is_ok();
        let _ = CloseHandle(handle);
        if ok {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    }
}

fn remember_foreground() {
    let fg = unsafe { GetForegroundWindow() };
    if !fg.is_invalid() && window_pid(fg) != own_pid() {
        LAST_FOREGROUND.store(fg.0 as isize, Ordering::Relaxed);
    }
}

#[tauri::command(async)]
pub fn list_windows() -> Vec<WinInfo> {
    remember_foreground();
    let mut handles: Vec<HWND> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut handles as *mut Vec<HWND> as isize));
    }
    let active = LAST_FOREGROUND.load(Ordering::Relaxed);
    handles
        .into_iter()
        .filter(|h| is_app_window(*h))
        .map(|h| {
            let exe = exe_path(window_pid(h));
            WinInfo {
                hwnd: h.0 as isize,
                title: window_title(h),
                icon: cached_icon(&exe),
                exe,
                active: h.0 as isize == active,
            }
        })
        .collect()
}

/// Click behaviour like the real taskbar: focus it, or minimize if it's already focused.
#[tauri::command]
pub fn focus_window(raw: isize) {
    let h = hwnd(raw);
    unsafe {
        let minimized = IsIconic(h).as_bool();
        if LAST_FOREGROUND.load(Ordering::Relaxed) == raw && !minimized {
            let _ = ShowWindow(h, SW_MINIMIZE);
            LAST_FOREGROUND.store(0, Ordering::Relaxed);
        } else {
            if minimized {
                let _ = ShowWindow(h, SW_RESTORE);
            }
            let _ = SetForegroundWindow(h);
            LAST_FOREGROUND.store(raw, Ordering::Relaxed);
        }
    }
}

// ------------------------------------------------------------------ icons

fn cached_icon(exe: &str) -> Option<String> {
    if exe.is_empty() {
        return None;
    }
    let mut cache = ICON_CACHE.lock().unwrap();
    if let Some(v) = cache.get(exe) {
        return v.clone();
    }
    let icon = unsafe { extract_icon(exe) };
    cache.insert(exe.to_string(), icon.clone());
    icon
}

unsafe fn extract_icon(exe: &str) -> Option<String> {
    // The dock draws icons around 45 physical px, so the standard 32 px icon
    // would look soft. Prefer a large one; files without it fall back below.
    let mut path = [0u16; 260];
    let encoded = wide(exe);
    if encoded.len() <= path.len() {
        path[..encoded.len()].copy_from_slice(&encoded);
        let mut sharp = [HICON::default()];
        let n = PrivateExtractIconsW(&path, 0, 96, 96, Some(&mut sharp), None, 0);
        if n != 0 && n != u32::MAX && !sharp[0].is_invalid() {
            let png = icon_to_png(sharp[0]);
            let _ = DestroyIcon(sharp[0]);
            if png.is_some() {
                return png;
            }
        }
    }
    let mut large = HICON::default();
    let n = ExtractIconExW(PCWSTR(encoded.as_ptr()), 0, Some(&mut large), None, 1);
    if n == 0 || large.is_invalid() {
        return None;
    }
    let png = icon_to_png(large);
    let _ = DestroyIcon(large);
    png
}

unsafe fn icon_to_png(icon: HICON) -> Option<String> {
    let mut info = ICONINFO::default();
    GetIconInfo(icon, &mut info).ok()?;
    let color = info.hbmColor;
    let mask = info.hbmMask;

    let result = (|| {
        if color.is_invalid() {
            return None;
        }
        let mut bm = BITMAP::default();
        if GetObjectW(
            color.into(),
            size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut BITMAP as *mut c_void),
        ) == 0
        {
            return None;
        }
        let (w, h) = (bm.bmWidth, bm.bmHeight);
        if w <= 0 || h <= 0 {
            return None;
        }
        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h, // top-down rows
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut px = vec![0u8; (w * h * 4) as usize];
        let hdc = GetDC(None);
        let lines = GetDIBits(
            hdc,
            color,
            0,
            h as u32,
            Some(px.as_mut_ptr() as *mut c_void),
            &mut bi,
            DIB_RGB_COLORS,
        );
        ReleaseDC(None, hdc);
        if lines == 0 {
            return None;
        }
        let has_alpha = px.chunks(4).any(|p| p[3] != 0);
        for p in px.chunks_mut(4) {
            p.swap(0, 2); // BGRA -> RGBA
            if !has_alpha {
                p[3] = 255;
            }
        }
        let mut out = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut out, w as u32, h as u32);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            let mut writer = enc.write_header().ok()?;
            writer.write_image_data(&px).ok()?;
        }
        Some(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(out)
        ))
    })();

    if !color.is_invalid() {
        let _ = DeleteObject(color.into());
    }
    if !mask.is_invalid() {
        let _ = DeleteObject(mask.into());
    }
    result
}

/// Opens the Start menu by tapping the Windows key.
#[tauri::command]
pub fn open_start() {
    let key = |flags| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: VK_LWIN, dwFlags: flags, ..Default::default() },
        },
    };
    let inputs = [key(Default::default()), key(KEYEVENTF_KEYUP)];
    unsafe {
        SendInput(&inputs, size_of::<INPUT>() as i32);
    }
}
