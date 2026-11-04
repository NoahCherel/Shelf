//! What the shell is doing: fullscreen apps, lock state. The frontend pauses on these.

use std::mem::size_of;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use windows::Win32::Foundation::RECT;
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId};

use super::taskbar::{Mode, TASKBAR};

pub static FULLSCREEN: AtomicBool = AtomicBool::new(false);
pub static LOCKED: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone)]
pub struct ShellStatus {
    pub fullscreen: bool,
    pub locked: bool,
    pub hidden_taskbar: bool,
}

pub fn status() -> ShellStatus {
    ShellStatus {
        fullscreen: FULLSCREEN.load(Ordering::Relaxed),
        locked: LOCKED.load(Ordering::Relaxed),
        hidden_taskbar: TASKBAR.mode() == Mode::Hidden,
    }
}

#[tauri::command]
pub fn shell_status() -> ShellStatus {
    status()
}

/// True when the foreground app covers its whole monitor (games, videos).
pub fn foreground_is_fullscreen() -> bool {
    unsafe {
        let fg = GetForegroundWindow();
        if fg.is_invalid() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(fg, Some(&mut pid));
        if pid == std::process::id() {
            return false;
        }
        let mut buf = [0u16; 256];
        let n = GetClassNameW(fg, &mut buf);
        let class = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
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
