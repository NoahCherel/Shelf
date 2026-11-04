//! The dock window: where it sits, and how it reacts to the shell. Decisions live
//! in `react`, which is pure; `run_action` is the only part that touches Windows.

use std::ffi::c_void;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::RemoteDesktop::{WTSRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    RegisterWindowMessageW, WM_DISPLAYCHANGE, WM_DPICHANGED, WM_POWERBROADCAST, WM_WTSSESSION_CHANGE,
};

use crate::glass::{self, capture::Region};

use super::appbar;
use super::events;
use super::taskbar::{Mode, TASKBAR};

const PBT_APMRESUMESUSPEND: usize = 0x7;
const PBT_APMRESUMEAUTOMATIC: usize = 0x12;
const WTS_SESSION_LOCK: usize = 0x7;
const WTS_SESSION_UNLOCK: usize = 0x8;
const ABN_POSCHANGED: usize = 0x1;
/// Space under the bar, inside the window.
const GAP_BELOW: f64 = 17.0;

#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// Centred on the bottom edge of the monitor, in physical pixels.
pub fn dock_rect(monitor: Rect, scale: f64, logical_width: f64, height: f64) -> Rect {
    let w = ((logical_width * scale).ceil() as i32).clamp(1, monitor.w);
    let h = (height * scale).round() as i32;
    Rect { x: monitor.x + (monitor.w - w) / 2, y: monitor.y + monitor.h - h, w, h }
}

#[derive(Clone, Copy, Debug)]
pub enum ShellEvent {
    TaskbarCreated,
    DisplayChange,
    Resume,
    Lock,
    Unlock,
    Tick { fullscreen: bool },
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Action {
    KeepTaskbar,
    RegisterAppbar,
    PlaceDock,
    RestartGlass,
    ShowDock,
    HideDock,
    Announce,
}

#[derive(Default)]
pub struct DockState {
    pub fullscreen: bool,
    pub locked: bool,
}

#[derive(Clone, Copy)]
pub struct Foreground {
    pub covers_dock_monitor: bool,
    pub on_dock_monitor: bool,
}

/// A fullscreen app keeps covering the dock's monitor while focus is on another
/// monitor, so only a window taking over this monitor brings the dock back.
pub fn fullscreen_now(fg: Foreground, previous_still_covers: bool) -> bool {
    fg.covers_dock_monitor || (!fg.on_dock_monitor && previous_still_covers)
}

pub fn react(event: ShellEvent, state: &mut DockState) -> Vec<Action> {
    use Action::*;
    match event {
        ShellEvent::TaskbarCreated => vec![KeepTaskbar, RegisterAppbar, PlaceDock],
        ShellEvent::DisplayChange => vec![KeepTaskbar, RegisterAppbar, PlaceDock, RestartGlass],
        ShellEvent::Resume => {
            let mut actions = vec![KeepTaskbar, RegisterAppbar, PlaceDock, RestartGlass];
            if !state.fullscreen {
                actions.push(ShowDock);
            }
            actions
        }
        ShellEvent::Lock => {
            state.locked = true;
            vec![Announce]
        }
        ShellEvent::Unlock => {
            state.locked = false;
            vec![KeepTaskbar, RegisterAppbar, PlaceDock, RestartGlass, Announce]
        }
        ShellEvent::Tick { fullscreen } => {
            let mut actions = vec![KeepTaskbar];
            if fullscreen != state.fullscreen {
                state.fullscreen = fullscreen;
                actions.push(if fullscreen { HideDock } else { ShowDock });
                actions.push(Announce);
            }
            actions
        }
    }
}

/// Logical width and height, as last reported by the page.
static SIZE: Mutex<(f64, f64)> = Mutex::new((400.0, 72.0));
static DOCK_HWND: AtomicIsize = AtomicIsize::new(0);
static EVENTS: OnceLock<Sender<ShellEvent>> = OnceLock::new();
static TASKBAR_CREATED: OnceLock<u32> = OnceLock::new();

fn size() -> (f64, f64) {
    *SIZE.lock().unwrap_or_else(|e| e.into_inner())
}

fn monitor_rect(dock: &WebviewWindow) -> Option<(Rect, f64)> {
    let m = dock.primary_monitor().ok().flatten()?;
    let (pos, size) = (m.position(), m.size());
    Some((Rect { x: pos.x, y: pos.y, w: size.width as i32, h: size.height as i32 }, m.scale_factor()))
}

fn place(dock: &WebviewWindow) {
    let Some((monitor, scale)) = monitor_rect(dock) else { return };
    let (width, height) = size();
    let r = dock_rect(monitor, scale, width, height);
    let _ = dock.set_size(PhysicalSize::new(r.w as u32, r.h as u32));
    let _ = dock.set_position(PhysicalPosition::new(r.x, r.y));
    let bar_height = r.h - (GAP_BELOW * scale).round() as i32;
    glass::set_region(dock.app_handle(), Region { x: r.x, y: r.y, w: r.w, h: bar_height.max(1) });
}

/// The reserved edge stays the monitor's full width, so maximized windows
/// keep stopping above the bar however narrow the bar is.
fn register_appbar(dock: &WebviewWindow) {
    let Some((m, scale)) = monitor_rect(dock) else { return };
    let h = (size().1 * scale).round() as i32;
    appbar::register(DOCK_HWND.load(Ordering::Relaxed), (m.x, m.y + m.h - h, m.x + m.w, m.y + m.h));
}

fn run_action(app: &AppHandle, action: Action) {
    if action == Action::KeepTaskbar {
        TASKBAR.keep();
        return;
    }
    let Some(dock) = app.get_webview_window("dock") else { return };
    match action {
        Action::RegisterAppbar => register_appbar(&dock),
        Action::PlaceDock => place(&dock),
        Action::ShowDock => {
            let _ = dock.show();
        }
        Action::HideDock => {
            let _ = dock.hide();
        }
        Action::RestartGlass => glass::restart(app),
        Action::Announce => {
            let status = events::status();
            glass::shell_changed(app, status.fullscreen, status.locked);
            let _ = app.emit("shell-changed", status);
        }
        Action::KeepTaskbar => {}
    }
}

fn watch(app: AppHandle, rx: std::sync::mpsc::Receiver<ShellEvent>) {
    let mut state = DockState::default();
    let mut tracker = events::FullscreenTracker::default();
    loop {
        let event = match rx.recv_timeout(Duration::from_secs(1)) {
            Ok(event) => event,
            Err(RecvTimeoutError::Timeout) => {
                let raw = DOCK_HWND.load(Ordering::Relaxed);
                ShellEvent::Tick { fullscreen: tracker.sample(raw) }
            }
            Err(RecvTimeoutError::Disconnected) => return,
        };
        let actions = react(event, &mut state);
        events::FULLSCREEN.store(state.fullscreen, Ordering::Relaxed);
        events::LOCKED.store(state.locked, Ordering::Relaxed);
        for action in actions {
            run_action(&app, action);
        }
    }
}

unsafe extern "system" fn on_message(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    let event = match msg {
        WM_DISPLAYCHANGE | WM_DPICHANGED => Some(ShellEvent::DisplayChange),
        WM_POWERBROADCAST if matches!(wparam.0, PBT_APMRESUMEAUTOMATIC | PBT_APMRESUMESUSPEND) => {
            Some(ShellEvent::Resume)
        }
        WM_WTSSESSION_CHANGE if wparam.0 == WTS_SESSION_LOCK => Some(ShellEvent::Lock),
        WM_WTSSESSION_CHANGE if wparam.0 == WTS_SESSION_UNLOCK => Some(ShellEvent::Unlock),
        appbar::APPBAR_CALLBACK if wparam.0 == ABN_POSCHANGED => Some(ShellEvent::DisplayChange),
        m if Some(&m) == TASKBAR_CREATED.get() => Some(ShellEvent::TaskbarCreated),
        _ => None,
    };
    if let (Some(event), Some(tx)) = (event, EVENTS.get()) {
        let _ = tx.send(event);
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

fn saved_taskbar_mode() -> Mode {
    let settings = crate::store::load("settings");
    match settings.as_ref().and_then(|s| s["taskbarMode"].as_str()) {
        Some("autohide") => Mode::Autohide,
        _ => Mode::Hidden,
    }
}

/// Hides the taskbar, reserves the edge and shows the dock. Runs on the main thread.
pub fn start(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    TASKBAR.apply(saved_taskbar_mode());

    let hwnd = dock.hwnd()?;
    DOCK_HWND.store(hwnd.0 as isize, Ordering::Relaxed);
    let (tx, rx) = channel();
    let _ = EVENTS.set(tx);
    let _ = TASKBAR_CREATED.set(unsafe { RegisterWindowMessageW(w!("TaskbarCreated")) });
    unsafe {
        let _ = SetWindowSubclass(HWND(hwnd.0 as *mut c_void), Some(on_message), 1, 0);
        let _ = WTSRegisterSessionNotification(HWND(hwnd.0 as *mut c_void), NOTIFY_FOR_THIS_SESSION);
    }

    register_appbar(&dock);
    place(&dock);
    dock.show()?;

    let handle = app.clone();
    std::thread::spawn(move || watch(handle, rx));
    Ok(())
}

pub fn stop() {
    let raw = DOCK_HWND.load(Ordering::Relaxed);
    if raw != 0 {
        appbar::unregister(raw);
    }
    TASKBAR.restore();
}

/// Fits the window to the bar. A new height also moves the reserved edge.
#[tauri::command]
pub fn set_dock_width(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let height_changed = {
        let mut size = SIZE.lock().unwrap_or_else(|e| e.into_inner());
        let changed = size.1 != height;
        *size = (width, height);
        changed
    };
    if height_changed {
        register_appbar(&dock);
    }
    place(&dock);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shell::taskbar::tests::{state_path, Fake};
    use crate::shell::taskbar::{Mode, Taskbar, TaskbarApi};

    const FHD: Rect = Rect { x: 0, y: 0, w: 1920, h: 1080 };

    #[test]
    fn dock_is_centred_on_monitor() {
        let r = dock_rect(FHD, 1.0, 1000.0, 72.0);
        assert_eq!(r, Rect { x: 460, y: 1008, w: 1000, h: 72 });
    }

    #[test]
    fn dock_never_exceeds_monitor_width() {
        let r = dock_rect(FHD, 1.0, 5000.0, 72.0);
        assert_eq!((r.x, r.w), (0, 1920));
    }

    #[test]
    fn dock_rect_is_correct_at_100_125_150_percent() {
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0), Rect { x: 560, y: 1008, w: 800, h: 72 });
        assert_eq!(dock_rect(FHD, 1.25, 800.0, 72.0), Rect { x: 460, y: 990, w: 1000, h: 90 });
        assert_eq!(dock_rect(FHD, 1.5, 800.0, 72.0), Rect { x: 360, y: 972, w: 1200, h: 108 });
    }

    #[test]
    fn monitor_with_offset_origin_is_respected() {
        let left = Rect { x: -1920, y: 200, w: 1920, h: 1080 };
        assert_eq!(dock_rect(left, 1.0, 1000.0, 72.0), Rect { x: -1460, y: 1208, w: 1000, h: 72 });
    }

    #[test]
    fn taskbar_created_event_rehides_and_reregisters_appbar() {
        let fake = Fake::default();
        let bar = Taskbar::new(fake.clone(), state_path("created"));
        bar.apply(Mode::Hidden);
        fake.calls.borrow_mut().clear();

        let actions = react(ShellEvent::TaskbarCreated, &mut DockState::default());
        assert!(actions.contains(&Action::RegisterAppbar));
        assert!(actions.contains(&Action::PlaceDock));
        assert!(actions.contains(&Action::KeepTaskbar));

        bar.keep(); // what KeepTaskbar runs
        assert_eq!(*fake.calls.borrow(), vec!["hide"]);
        assert!(fake.autohide());
    }

    #[test]
    fn resume_from_sleep_reasserts_position_and_shows_dock() {
        let actions = react(ShellEvent::Resume, &mut DockState::default());
        for wanted in [Action::KeepTaskbar, Action::RegisterAppbar, Action::PlaceDock, Action::ShowDock] {
            assert!(actions.contains(&wanted), "{wanted:?}");
        }
    }

    #[test]
    fn resume_during_fullscreen_stays_hidden() {
        let mut state = DockState { fullscreen: true, locked: false };
        assert!(!react(ShellEvent::Resume, &mut state).contains(&Action::ShowDock));
    }

    #[test]
    fn fullscreen_hides_once_and_announces_it() {
        let mut state = DockState::default();
        let first = react(ShellEvent::Tick { fullscreen: true }, &mut state);
        assert!(first.contains(&Action::HideDock) && first.contains(&Action::Announce));
        let second = react(ShellEvent::Tick { fullscreen: true }, &mut state);
        assert_eq!(second, vec![Action::KeepTaskbar]);
        let left = react(ShellEvent::Tick { fullscreen: false }, &mut state);
        assert!(left.contains(&Action::ShowDock) && left.contains(&Action::Announce));
    }

    #[test]
    fn fullscreen_on_another_monitor_click_does_not_reshow_dock() {
        // A game covers the dock's monitor; the owner clicks a window on another one.
        let f = Foreground { covers_dock_monitor: false, on_dock_monitor: false };
        assert!(fullscreen_now(f, true));
        // But switching to a normal window on the dock's own monitor brings it back.
        let f = Foreground { covers_dock_monitor: false, on_dock_monitor: true };
        assert!(!fullscreen_now(f, true));
    }

    #[test]
    fn fullscreen_on_another_monitor_alone_leaves_the_dock() {
        let f = Foreground { covers_dock_monitor: false, on_dock_monitor: false };
        assert!(!fullscreen_now(f, false));
    }

    #[test]
    fn locking_only_announces() {
        let mut state = DockState::default();
        assert_eq!(react(ShellEvent::Lock, &mut state), vec![Action::Announce]);
        assert!(state.locked);
    }

    #[test]
    fn unlocking_reasserts_after_explorer_may_have_moved_things() {
        let mut state = DockState { fullscreen: false, locked: true };
        let actions = react(ShellEvent::Unlock, &mut state);
        assert!(!state.locked);
        assert!(actions.contains(&Action::PlaceDock) && actions.contains(&Action::Announce));
    }
}
