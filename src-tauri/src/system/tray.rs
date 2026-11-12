//! The hidden icons. Windows draws them in its own grid and handles their clicks and menus, so Shelf
//! opens that grid with Windows' own keys and moves it above the dock's chevron. Passing clicks on
//! to other apps by hand can make them crash, and this never touches them.

use crate::util::lock;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::Input::KeyboardAndMouse::{VK_B, VK_ESCAPE, VK_LWIN, VK_RETURN};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetForegroundWindow, GetWindowRect, IsWindowVisible, SetWindowPos, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER,
};

use super::tap_keys;
use crate::apps::take_foreground_raw;
use crate::shell::card::{card_rect, Span};
use crate::shell::dock::Rect;

/// A click that closes the grid arrives this soon after it closed.
const REOPEN_GUARD_MS: u64 = 300;
const FOCUS_WAIT: Duration = Duration::from_millis(800);
const OPEN_WAIT: Duration = Duration::from_millis(1500);
const POLL: Duration = Duration::from_millis(15);
const CLOSE_POLL: Duration = Duration::from_millis(60);
const DOCK_GAP: f64 = 8.0;

static CLOSED_AT: Mutex<Option<Instant>> = Mutex::new(None);

#[derive(PartialEq, Debug)]
enum Step {
    Open,
    Close,
    Nothing,
}

fn next_step(open: bool, since_closed_ms: Option<u64>) -> Step {
    match (open, since_closed_ms) {
        (true, _) => Step::Close,
        (false, Some(ms)) if ms < REOPEN_GUARD_MS => Step::Nothing,
        (false, _) => Step::Open,
    }
}

/// A key pressed for the taskbar must never land in the app someone is typing in.
fn key_is_safe(foreground: isize, intended: isize) -> bool {
    intended != 0 && foreground == intended
}

/// After closing, focus goes back to the app it came from, unless someone has moved on since.
fn should_give_focus_back(foreground: isize, taskbar: isize, previous: isize) -> bool {
    foreground == taskbar && previous != 0 && previous != taskbar
}

fn raw(h: HWND) -> isize {
    h.0 as isize
}

fn foreground() -> isize {
    raw(unsafe { GetForegroundWindow() })
}

fn taskbar() -> Option<HWND> {
    unsafe { FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()).ok() }
}

fn grid() -> Option<HWND> {
    unsafe { FindWindowW(w!("TopLevelWindowForOverflowXamlIsland"), PCWSTR::null()).ok() }.filter(|h| unsafe { IsWindowVisible(*h) }.as_bool())
}

fn wait_for<T>(limit: Duration, mut found: impl FnMut() -> Option<T>) -> Option<T> {
    let started = Instant::now();
    loop {
        if let Some(value) = found() {
            return Some(value);
        }
        if started.elapsed() >= limit {
            return None;
        }
        std::thread::sleep(POLL);
    }
}

/// Above the chevron, as a card sits above its tile.
fn place(app: &AppHandle, flyout: HWND, tile_x: f64, tile_width: f64) -> Result<(), String> {
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let run = || -> tauri::Result<Option<(Span, Rect, Rect, i32)>> {
        let Some(m) = dock.primary_monitor()? else { return Ok(None) };
        let scale = m.scale_factor();
        let (pos, size) = (dock.outer_position()?, dock.outer_size()?);
        Ok(Some((
            Span { x: pos.x + (tile_x * scale).round() as i32, w: (tile_width * scale).round() as i32 },
            Rect { x: pos.x, y: pos.y, w: size.width as i32, h: size.height as i32 },
            Rect { x: m.position().x, y: m.position().y, w: m.size().width as i32, h: m.size().height as i32 },
            (DOCK_GAP * scale).round() as i32,
        )))
    };
    let Some((tile, dock_rect, monitor, gap)) = run().map_err(|e| e.to_string())? else { return Ok(()) };
    unsafe {
        let mut now = RECT::default();
        GetWindowRect(flyout, &mut now).map_err(|e| e.to_string())?;
        let at = card_rect(tile, dock_rect, monitor, (now.right - now.left, now.bottom - now.top), gap);
        SetWindowPos(flyout, None, at.x, at.y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE).map_err(|e| e.to_string())
    }
}

/// Notes when the grid closes, and gives the focus back.
fn watch_until_closed(bar: isize, previous: isize) {
    std::thread::spawn(move || {
        while grid().is_some() {
            std::thread::sleep(CLOSE_POLL);
        }
        *lock(&CLOSED_AT) = Some(Instant::now());
        // Windows hands focus to the taskbar a moment after the grid has gone.
        std::thread::sleep(CLOSE_POLL);
        if should_give_focus_back(foreground(), bar, previous) {
            take_foreground_raw(previous);
        }
    });
}

/// Escape closes the grid only once it has the focus, which it may have lost.
/// Windows' grid of hidden icons is showing.
pub fn grid_open() -> bool {
    grid().is_some()
}

pub fn close_grid() {
    let Some(flyout) = grid() else { return };
    let flyout = raw(flyout);
    take_foreground_raw(flyout);
    if wait_for(FOCUS_WAIT, || key_is_safe(foreground(), flyout).then_some(())).is_some() {
        tap_keys(&[VK_ESCAPE]);
    }
}

/// Tile position is logical px inside the dock window.
#[tauri::command(async)]
pub fn tray_toggle(app: AppHandle, tile_x: f64, tile_width: f64) -> Result<(), String> {
    crate::preview::guard()?;
    let since_closed = lock(&CLOSED_AT).map(|at| at.elapsed().as_millis() as u64);
    let open = grid();
    match next_step(open.is_some(), since_closed) {
        Step::Nothing => Ok(()),
        Step::Close => {
            close_grid();
            Ok(())
        }
        Step::Open => {
            let bar = raw(taskbar().ok_or("no taskbar")?);
            let previous = foreground();
            // Win+B puts the focus on the taskbar's chevron, and Enter presses it. This works with
            // the taskbar hidden, and it stays hidden.
            tap_keys(&[VK_LWIN, VK_B]);
            if wait_for(FOCUS_WAIT, || key_is_safe(foreground(), bar).then_some(())).is_none() {
                return Err("Windows didn't focus its taskbar.".into());
            }
            tap_keys(&[VK_RETURN]);
            let Some(flyout) = wait_for(OPEN_WAIT, grid) else {
                if should_give_focus_back(foreground(), bar, previous) {
                    take_foreground_raw(previous);
                }
                return Err("Windows didn't open its hidden icons.".into());
            };
            let placed = place(&app, flyout, tile_x, tile_width);
            watch_until_closed(bar, previous);
            placed
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closed_for_a_while_opens() {
        assert_eq!(next_step(false, None), Step::Open);
        assert_eq!(next_step(false, Some(2000)), Step::Open);
    }

    #[test]
    fn open_closes() {
        assert_eq!(next_step(true, None), Step::Close);
        assert_eq!(next_step(true, Some(50)), Step::Close);
    }

    #[test]
    fn the_click_that_just_closed_it_doesnt_reopen_it() {
        // Clicking away closes Windows' grid, and that click is the one on the chevron.
        assert_eq!(next_step(false, Some(100)), Step::Nothing);
        assert_eq!(next_step(false, Some(REOPEN_GUARD_MS - 1)), Step::Nothing);
        assert_eq!(next_step(false, Some(REOPEN_GUARD_MS)), Step::Open);
    }

    #[test]
    fn a_key_only_goes_to_the_window_it_was_meant_for() {
        assert!(key_is_safe(7, 7));
        assert!(!key_is_safe(9, 7), "someone's app has the focus");
        assert!(!key_is_safe(0, 0), "no window at all");
    }

    #[test]
    fn focus_returns_only_from_the_taskbar() {
        assert!(should_give_focus_back(1, 1, 5));
        assert!(!should_give_focus_back(9, 1, 5), "they've moved on to another app");
        assert!(!should_give_focus_back(1, 1, 0), "nothing to go back to");
        assert!(!should_give_focus_back(1, 1, 1), "it came from the taskbar");
    }
}
