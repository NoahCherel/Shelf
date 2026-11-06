//! Reserves a screen edge, so maximized windows stop short of the dock.

use std::ffi::c_void;
use std::mem::size_of;

use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::Shell::{SHAppBarMessage, ABE_BOTTOM, ABE_TOP, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::WM_USER;

use super::dock::Edge;

pub const APPBAR_CALLBACK: u32 = WM_USER + 0x1A1;

fn data(raw: isize) -> APPBARDATA {
    APPBARDATA {
        cbSize: size_of::<APPBARDATA>() as u32,
        hWnd: HWND(raw as *mut c_void),
        uCallbackMessage: APPBAR_CALLBACK,
        ..Default::default()
    }
}

/// Registers `raw` as an appbar on that edge. Safe to call again: Windows ignores a repeat ABM_NEW.
/// Returns the rect Windows granted (left, top, right, bottom).
pub fn register(raw: isize, rect: (i32, i32, i32, i32), edge: Edge) -> (i32, i32, i32, i32) {
    let height = rect.3 - rect.1;
    let mut abd = data(raw);
    unsafe {
        SHAppBarMessage(ABM_NEW, &mut abd);
        abd.uEdge = if edge == Edge::Top { ABE_TOP } else { ABE_BOTTOM };
        abd.rc = RECT { left: rect.0, top: rect.1, right: rect.2, bottom: rect.3 };
        SHAppBarMessage(ABM_QUERYPOS, &mut abd);
        // Windows may have moved the strip's far side, so it's measured from the screen's edge.
        match edge {
            Edge::Top => abd.rc.bottom = abd.rc.top + height,
            Edge::Bottom => abd.rc.top = abd.rc.bottom - height,
        }
        SHAppBarMessage(ABM_SETPOS, &mut abd);
    }
    (abd.rc.left, abd.rc.top, abd.rc.right, abd.rc.bottom)
}

pub fn unregister(raw: isize) {
    let mut abd = data(raw);
    unsafe { SHAppBarMessage(ABM_REMOVE, &mut abd) };
}
