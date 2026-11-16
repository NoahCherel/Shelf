//! What the shell is doing: fullscreen apps, lock state. The frontend pauses on these.

use std::ffi::c_void;
use std::mem::size_of;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

use serde::Serialize;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, IsZoomed,
};

use super::dock::{fullscreen_now, is_fullscreen, Foreground};
use super::taskbar::{Mode, TASKBAR};

pub static FULLSCREEN: AtomicBool = AtomicBool::new(false);
pub static LOCKED: AtomicBool = AtomicBool::new(false);
pub static AUTOHIDDEN: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone)]
pub struct ShellStatus {
    pub fullscreen: bool,
    pub locked: bool,
    pub hidden_taskbar: bool,
    /// Slid away by auto-hide.
    pub autohidden: bool,
}

pub fn status() -> ShellStatus {
    ShellStatus {
        fullscreen: FULLSCREEN.load(Ordering::Relaxed),
        locked: LOCKED.load(Ordering::Relaxed),
        hidden_taskbar: TASKBAR.mode() == Mode::Hidden,
        autohidden: AUTOHIDDEN.load(Ordering::Relaxed),
    }
}

#[tauri::command]
pub fn shell_status() -> ShellStatus {
    status()
}

fn is_ours(h: HWND) -> bool {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(h, Some(&mut pid)) };
    pid == std::process::id()
}

fn is_desktop(h: HWND) -> bool {
    let mut buf = [0u16; 256];
    let n = unsafe { GetClassNameW(h, &mut buf) };
    let class = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
    matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd")
}

/// The desktop, or the taskbar, has the focus: no app is in front.
pub fn desktop_in_front() -> bool {
    let fg = unsafe { GetForegroundWindow() };
    !fg.is_invalid() && is_desktop(fg)
}

/// True when `h` is showing and fills `monitor` entirely.
fn covers(h: HWND, monitor: HMONITOR) -> bool {
    unsafe {
        if !IsWindow(Some(h)).as_bool() || !IsWindowVisible(h).as_bool() || IsIconic(h).as_bool() || is_desktop(h) {
            return false;
        }
        if MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST) != monitor {
            return false;
        }
        let mut r = RECT::default();
        if GetWindowRect(h, &mut r).is_err() {
            return false;
        }
        let mut mi = MONITORINFO { cbSize: size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(monitor, &mut mi).as_bool() {
            return false;
        }
        let m = mi.rcMonitor;
        let fills = r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom;
        is_fullscreen(fills, IsZoomed(h).as_bool())
    }
}

/// The window in front fills its screen, whichever screen that is: a game Win+T must be left to.
pub fn front_is_fullscreen() -> bool {
    unsafe {
        let fg = GetForegroundWindow();
        !fg.is_invalid() && !is_ours(fg) && covers(fg, MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST))
    }
}

/// Remembers the window that hid the dock, so it can tell when that window is gone.
#[derive(Default)]
pub struct FullscreenTracker {
    window: isize,
}

impl FullscreenTracker {
    pub fn sample(&mut self, dock_raw: isize) -> bool {
        unsafe {
            let dock_monitor = MonitorFromWindow(HWND(dock_raw as *mut c_void), MONITOR_DEFAULTTONEAREST);
            let fg = GetForegroundWindow();
            let ours = fg.is_invalid() || is_ours(fg);
            let info = Foreground {
                covers_dock_monitor: !ours && covers(fg, dock_monitor),
                on_dock_monitor: ours || MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST) == dock_monitor,
            };
            let previous = self.window != 0 && covers(HWND(self.window as *mut c_void), dock_monitor);
            let fullscreen = fullscreen_now(info, previous);
            if info.covers_dock_monitor {
                self.window = fg.0 as isize;
            } else if !fullscreen {
                self.window = 0;
            }
            fullscreen
        }
    }
}
