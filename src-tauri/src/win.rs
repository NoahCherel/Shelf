//! Windows-specific plumbing: taskbar hiding, appbar registration, window
//! enumeration with icons, media session control, battery, fullscreen detection.

use std::collections::HashMap;
use std::ffi::c_void;
use std::mem::size_of;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::{LazyLock, Mutex};

use base64::Engine;
use serde::Serialize;
use windows::core::{w, BOOL, PCWSTR, PWSTR};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager as MediaManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetMonitorInfoW, GetObjectW, MonitorFromWindow, ReleaseDC,
    BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, MONITORINFO,
    MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_LWIN,
};
use windows::Win32::UI::Shell::{
    ExtractIconExW, SHAppBarMessage, ABE_BOTTOM, ABM_GETSTATE, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE,
    ABM_SETPOS, ABM_SETSTATE, ABS_ALWAYSONTOP, ABS_AUTOHIDE, APPBARDATA,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, EnumWindows, FindWindowExW, FindWindowW, GetClassNameW, GetForegroundWindow,
    GetIconInfo, GetWindow, GetWindowLongPtrW, GetWindowRect, GetWindowTextLengthW,
    GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, PrivateExtractIconsW,
    SetForegroundWindow,
    ShowWindow, GWL_EXSTYLE, GW_OWNER, HICON, ICONINFO, SW_HIDE, SW_MINIMIZE, SW_RESTORE, SW_SHOW,
    WM_USER, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

/// Last foreground window that wasn't ours (clicking the dock steals focus,
/// so we remember what was active just before).
static LAST_FOREGROUND: AtomicIsize = AtomicIsize::new(0);
static TASKBAR_HIDDEN: Mutex<bool> = Mutex::new(false);
static ICON_CACHE: LazyLock<Mutex<HashMap<String, Option<String>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const APPBAR_CALLBACK: u32 = WM_USER + 0x1A1;

pub fn hwnd(raw: isize) -> HWND {
    HWND(raw as *mut c_void)
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn own_pid() -> u32 {
    std::process::id()
}

// ---------------------------------------------------------------- taskbar

fn taskbars() -> Vec<HWND> {
    let mut out = Vec::new();
    unsafe {
        if let Ok(h) = FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) {
            if !h.is_invalid() {
                out.push(h);
            }
        }
        let mut after: Option<HWND> = None;
        loop {
            match FindWindowExW(None, after, w!("Shell_SecondaryTrayWnd"), PCWSTR::null()) {
                Ok(h) if !h.is_invalid() => {
                    out.push(h);
                    after = Some(h);
                }
                _ => break,
            }
        }
    }
    out
}

fn taskbar_autohide() -> bool {
    unsafe {
        let Ok(tray) = FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) else {
            return false;
        };
        let mut abd = APPBARDATA {
            cbSize: size_of::<APPBARDATA>() as u32,
            hWnd: tray,
            ..Default::default()
        };
        (SHAppBarMessage(ABM_GETSTATE, &mut abd) as u32 & ABS_AUTOHIDE) != 0
    }
}

fn set_taskbar_autohide(on: bool) {
    unsafe {
        let Ok(tray) = FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) else {
            return;
        };
        let mut abd = APPBARDATA {
            cbSize: size_of::<APPBARDATA>() as u32,
            hWnd: tray,
            lParam: LPARAM(if on { ABS_AUTOHIDE } else { ABS_ALWAYSONTOP } as isize),
            ..Default::default()
        };
        SHAppBarMessage(ABM_SETSTATE, &mut abd);
    }
}

fn state_file() -> std::path::PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    let dir = std::path::Path::new(&base).join("Shelf");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("taskbar_state.txt")
}

/// Hides the Windows taskbar. The original auto-hide setting is saved to a
/// file first, so it can be restored even after a crash (`--restore-taskbar`).
pub fn hide_taskbar() {
    let file = state_file();
    if !file.exists() {
        let _ = std::fs::write(&file, if taskbar_autohide() { "1" } else { "0" });
    }
    set_taskbar_autohide(true);
    *TASKBAR_HIDDEN.lock().unwrap_or_else(|e| e.into_inner()) = true;
    keep_taskbar_hidden();
}

/// Explorer shows the taskbar again after an auto-hide change or its own
/// restart, so this is called periodically rather than hiding it just once.
pub fn keep_taskbar_hidden() {
    let hidden = TASKBAR_HIDDEN.lock().unwrap_or_else(|e| e.into_inner());
    if !*hidden {
        return;
    }
    for h in taskbars() {
        unsafe {
            if IsWindowVisible(h).as_bool() {
                let _ = ShowWindow(h, SW_HIDE);
            }
        }
    }
}

pub fn restore_taskbar() {
    // Held until the end so keep_taskbar_hidden can't undo this mid-restore.
    let mut hidden = TASKBAR_HIDDEN.lock().unwrap_or_else(|e| e.into_inner());
    *hidden = false;
    let file = state_file();
    // No state file means there is nothing to undo (e.g. a second restore after
    // the panic hook ran); don't guess and overwrite the user's auto-hide setting.
    if let Ok(saved) = std::fs::read_to_string(&file) {
        set_taskbar_autohide(saved.trim() == "1");
    }
    for h in taskbars() {
        unsafe {
            let _ = ShowWindow(h, SW_SHOW);
        }
    }
    let _ = std::fs::remove_file(file);
}

// ----------------------------------------------------------------- appbar

/// Registers `raw` as a bottom-edge appbar so maximized windows stop above it.
/// Returns the rect Windows granted (left, top, right, bottom).
pub fn register_appbar(raw: isize, rect: (i32, i32, i32, i32)) -> (i32, i32, i32, i32) {
    let height = rect.3 - rect.1;
    unsafe {
        let mut abd = APPBARDATA {
            cbSize: size_of::<APPBARDATA>() as u32,
            hWnd: hwnd(raw),
            uCallbackMessage: APPBAR_CALLBACK,
            ..Default::default()
        };
        SHAppBarMessage(ABM_NEW, &mut abd);
        abd.uEdge = ABE_BOTTOM;
        abd.rc = RECT { left: rect.0, top: rect.1, right: rect.2, bottom: rect.3 };
        SHAppBarMessage(ABM_QUERYPOS, &mut abd);
        abd.rc.top = abd.rc.bottom - height;
        SHAppBarMessage(ABM_SETPOS, &mut abd);
        (abd.rc.left, abd.rc.top, abd.rc.right, abd.rc.bottom)
    }
}

pub fn unregister_appbar(raw: isize) {
    unsafe {
        let mut abd = APPBARDATA {
            cbSize: size_of::<APPBARDATA>() as u32,
            hWnd: hwnd(raw),
            ..Default::default()
        };
        SHAppBarMessage(ABM_REMOVE, &mut abd);
    }
}

// ---------------------------------------------------------------- windows

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

fn class_name(h: HWND) -> String {
    let mut buf = [0u16; 256];
    let n = unsafe { GetClassNameW(h, &mut buf) };
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

/// True when the foreground app covers its whole monitor (games, videos),
/// so the dock can get out of the way.
pub fn foreground_is_fullscreen() -> bool {
    remember_foreground();
    unsafe {
        let fg = GetForegroundWindow();
        if fg.is_invalid() || window_pid(fg) == own_pid() {
            return false;
        }
        let class = class_name(fg);
        if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd") {
            return false;
        }
        let mut r = RECT::default();
        if GetWindowRect(fg, &mut r).is_err() {
            return false;
        }
        let mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO { cbSize: size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(mon, &mut mi).as_bool() {
            return false;
        }
        let m = mi.rcMonitor;
        r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
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

// ------------------------------------------------------------------ media

#[derive(Serialize)]
pub struct MediaInfo {
    pub title: String,
    pub artist: String,
    pub playing: bool,
    pub app: String,
}

pub fn media_info() -> Option<MediaInfo> {
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
    let mgr = MediaManager::RequestAsync().ok()?.get().ok()?;
    let session = mgr.GetCurrentSession().ok()?;
    let props = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
    let title = props.Title().ok()?.to_string();
    if title.is_empty() {
        return None;
    }
    let artist = props.Artist().map(|a| a.to_string()).unwrap_or_default();
    let playing = session
        .GetPlaybackInfo()
        .ok()
        .and_then(|i| i.PlaybackStatus().ok())
        .map(|s| s == PlaybackStatus::Playing)
        .unwrap_or(false);
    let app = session
        .SourceAppUserModelId()
        .map(|s| s.to_string())
        .unwrap_or_default();
    Some(MediaInfo { title, artist, playing, app })
}

pub fn media_cmd(cmd: &str) -> bool {
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
    let run = || -> windows::core::Result<bool> {
        let mgr = MediaManager::RequestAsync()?.get()?;
        let s = mgr.GetCurrentSession()?;
        let op = match cmd {
            "toggle" => s.TryTogglePlayPauseAsync()?,
            "pause" => s.TryPauseAsync()?,
            "play" => s.TryPlayAsync()?,
            "next" => s.TrySkipNextAsync()?,
            "prev" => s.TrySkipPreviousAsync()?,
            _ => return Ok(false),
        };
        op.get()
    };
    run().unwrap_or(false)
}

// ---------------------------------------------------------------- misc

/// (percent, charging) — None on desktops without a battery.
pub fn battery() -> Option<(u8, bool)> {
    let mut s = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut s).ok()? };
    if s.BatteryFlag == 128 || s.BatteryLifePercent == 255 {
        return None;
    }
    Some((s.BatteryLifePercent, s.ACLineStatus == 1))
}

/// Opens the Start menu by tapping the Windows key.
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

/// Adds/removes Shelf from HKCU\...\Run so it starts with Windows.
pub fn set_autostart(on: bool) -> bool {
    let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    let mut cmd = std::process::Command::new("reg");
    if on {
        let exe = std::env::current_exe().unwrap_or_default();
        cmd.args(["add", key, "/v", "Shelf", "/t", "REG_SZ", "/f", "/d"])
            .arg(format!("\"{}\"", exe.display()));
    } else {
        cmd.args(["delete", key, "/v", "Shelf", "/f"]);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn open_url(url: &str) {
    if url.starts_with("http://") || url.starts_with("https://") {
        let _ = std::process::Command::new("explorer").arg(url).spawn();
    }
}
