//! The dock window: where it sits, and how it reacts to the shell. Decisions live
//! in `react`, which is pure; `run_action` is the only part that touches Windows.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::RemoteDesktop::{WTSRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, RegisterWindowMessageW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WM_DISPLAYCHANGE, WM_DPICHANGED, WM_POWERBROADCAST, WM_WTSSESSION_CHANGE,
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

#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Edge {
    Bottom,
    Top,
}

impl Edge {
    pub fn from_name(name: Option<&str>) -> Edge {
        if name == Some("top") {
            Edge::Top
        } else {
            Edge::Bottom
        }
    }
}

/// What the page reports, in logical pixels.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct DockLayout {
    pub width: f64,
    pub bar: f64,
    pub gap: f64,
    /// Over other windows, reserving nothing. Otherwise maximized windows stop short of the dock.
    pub float: bool,
    pub edge: Edge,
}

/// Centred near an edge of the monitor, in physical pixels. The window is only as
/// tall as the bar: the gap stays outside it, so it can't swallow clicks.
pub fn dock_rect(monitor: Rect, scale: f64, logical_width: f64, bar: f64, gap: f64, edge: Edge) -> Rect {
    let w = ((logical_width * scale).ceil() as i32).clamp(1, monitor.w);
    let h = (bar * scale).round() as i32;
    let lift = (gap * scale).round() as i32;
    let y = match edge {
        Edge::Bottom => monitor.y + monitor.h - lift - h,
        Edge::Top => monitor.y + lift,
    };
    Rect { x: monitor.x + (monitor.w - w) / 2, y, w, h }
}

/// The strip of the screen to keep clear (left, top, right, bottom).
pub fn reserved_rect(monitor: Rect, height: i32, edge: Edge) -> (i32, i32, i32, i32) {
    let (left, right) = (monitor.x, monitor.x + monitor.w);
    match edge {
        Edge::Bottom => (left, monitor.y + monitor.h - height, right, monitor.y + monitor.h),
        Edge::Top => (left, monitor.y, right, monitor.y + height),
    }
}

/// Where the window goes while it's being dragged, `offset` logical px from where it rests.
pub fn dragged_y(rest: Rect, monitor: Rect, scale: f64, offset: f64) -> i32 {
    (rest.y + (offset * scale).round() as i32).clamp(monitor.y, monitor.y + monitor.h - rest.h)
}

/// How much of the screen edge to keep clear, in physical pixels; None when floating.
pub fn reserved_height(layout: DockLayout, scale: f64) -> Option<i32> {
    let bar = (layout.bar * scale).round() as i32;
    let gap = (layout.gap * scale).round() as i32;
    (!layout.float).then_some(bar + gap)
}

/// A maximized window can overshoot the monitor too, but it isn't fullscreen.
pub fn is_fullscreen(fills_monitor: bool, maximized: bool) -> bool {
    fills_monitor && !maximized
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

/// As last reported by the page; `start` fills it from the saved settings.
static LAYOUT: Mutex<DockLayout> = Mutex::new(DockLayout { width: 400.0, bar: 55.0, gap: 6.0, float: true, edge: Edge::Bottom });
/// Being dragged: the pointer decides where it is, and the glass waits until it lands.
static MOVING: AtomicBool = AtomicBool::new(false);
static DOCK_HWND: AtomicIsize = AtomicIsize::new(0);
static EVENTS: OnceLock<Sender<ShellEvent>> = OnceLock::new();
static TASKBAR_CREATED: OnceLock<u32> = OnceLock::new();

fn layout() -> DockLayout {
    *LAYOUT.lock().unwrap_or_else(|e| e.into_inner())
}

fn monitor_rect(dock: &WebviewWindow) -> Option<(Rect, f64)> {
    let m = dock.primary_monitor().ok().flatten()?;
    let (pos, size) = (m.position(), m.size());
    Some((Rect { x: pos.x, y: pos.y, w: size.width as i32, h: size.height as i32 }, m.scale_factor()))
}

fn place(dock: &WebviewWindow) {
    let Some((monitor, scale)) = monitor_rect(dock) else { return };
    let l = layout();
    let r = dock_rect(monitor, scale, l.width, l.bar, l.gap, l.edge);
    let _ = dock.set_size(PhysicalSize::new(r.w as u32, r.h as u32));
    if MOVING.load(Ordering::Relaxed) {
        return;
    }
    let _ = dock.set_position(PhysicalPosition::new(r.x, r.y));
    glass::set_region(dock.app_handle(), Region { x: r.x, y: r.y, w: r.w, h: r.h });
}

/// The reserved edge stays the monitor's full width, so maximized windows
/// keep stopping short of the bar however narrow the bar is.
fn register_appbar(dock: &WebviewWindow) {
    let Some((m, scale)) = monitor_rect(dock) else { return };
    if !crate::preview::current().reserve_edge {
        return;
    }
    let raw = DOCK_HWND.load(Ordering::Relaxed);
    let l = layout();
    match reserved_height(l, scale) {
        Some(h) => {
            appbar::register(raw, reserved_rect(m, h, l.edge), l.edge);
        }
        None => appbar::unregister(raw),
    }
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

fn saved_taskbar_mode(settings: Option<&serde_json::Value>) -> Mode {
    match settings.and_then(|s| s["taskbarMode"].as_str()) {
        Some("autohide") => Mode::Autohide,
        _ => Mode::Hidden,
    }
}

/// So the first placement is already right, before the page has reported anything.
fn saved_layout(settings: Option<&serde_json::Value>) -> DockLayout {
    let mut l = layout();
    if let Some(s) = settings {
        l.float = s["floatOverWindows"].as_bool().unwrap_or(l.float);
        l.gap = s["edgeGap"].as_f64().unwrap_or(l.gap);
        l.bar = s["size"].as_f64().map_or(l.bar, |t| (t * 1.09).ceil());
        l.edge = Edge::from_name(s["edge"].as_str());
        if s["dockWidth"].as_str() == Some("full") {
            l.gap = 0.0;
        }
    }
    l
}

/// Hides the taskbar, reserves the edge and shows the dock. Runs on the main thread.
pub fn start(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let settings = crate::store::load("settings");
    if crate::preview::current().touch_taskbar {
        TASKBAR.apply(saved_taskbar_mode(settings.as_ref()));
    }
    *LAYOUT.lock().unwrap_or_else(|e| e.into_inner()) = saved_layout(settings.as_ref());

    let hwnd = dock.hwnd()?;
    DOCK_HWND.store(hwnd.0 as isize, Ordering::Relaxed);
    let (tx, rx) = channel();
    let _ = EVENTS.set(tx);
    let _ = TASKBAR_CREATED.set(unsafe { RegisterWindowMessageW(w!("TaskbarCreated")) });
    unsafe {
        // Clicking the dock mustn't take focus from your app, as with the real taskbar.
        let style = GetWindowLongPtrW(HWND(hwnd.0 as *mut c_void), GWL_EXSTYLE);
        SetWindowLongPtrW(HWND(hwnd.0 as *mut c_void), GWL_EXSTYLE, style | WS_EX_NOACTIVATE.0 as isize);
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
    crate::system::tray::close_grid();
    let raw = DOCK_HWND.load(Ordering::Relaxed);
    if raw != 0 {
        appbar::unregister(raw);
    }
    crate::preview::restore_taskbar(|| TASKBAR.restore());
}

/// Fits the window to the bar. Anything but a new width also changes what's reserved.
#[tauri::command]
pub fn set_dock_width(app: AppHandle, width: f64, bar: f64, gap: f64, float: bool, edge: String) -> Result<(), String> {
    let edge = Edge::from_name(Some(&edge));
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let edge_changed = {
        let mut current = LAYOUT.lock().unwrap_or_else(|e| e.into_inner());
        let changed = current.bar != bar || current.gap != gap || current.float != float || current.edge != edge;
        *current = DockLayout { width, bar, gap, float, edge };
        changed
    };
    if edge_changed {
        register_appbar(&dock);
    }
    place(&dock);
    Ok(())
}

/// The dock follows the pointer, `offset` logical px from where it rests.
#[tauri::command]
pub fn dock_drag(app: AppHandle, offset: f64) -> Result<(), String> {
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let (monitor, scale) = monitor_rect(&dock).ok_or("no monitor")?;
    let l = layout();
    let rest = dock_rect(monitor, scale, l.width, l.bar, l.gap, l.edge);
    MOVING.store(true, Ordering::Relaxed);
    dock.set_position(PhysicalPosition::new(rest.x, dragged_y(rest, monitor, scale, offset))).map_err(|e| e.to_string())
}

/// Let go: it goes back to where its layout says.
#[tauri::command]
pub fn dock_drag_end(app: AppHandle) -> Result<(), String> {
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    MOVING.store(false, Ordering::Relaxed);
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
        let r = dock_rect(FHD, 1.0, 1000.0, 72.0, 0.0, Edge::Bottom);
        assert_eq!(r, Rect { x: 460, y: 1008, w: 1000, h: 72 });
    }

    #[test]
    fn dock_never_exceeds_monitor_width() {
        let r = dock_rect(FHD, 1.0, 5000.0, 72.0, 0.0, Edge::Bottom);
        assert_eq!((r.x, r.w), (0, 1920));
    }

    #[test]
    fn dock_rect_is_correct_at_100_125_150_percent() {
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0, 0.0, Edge::Bottom), Rect { x: 560, y: 1008, w: 800, h: 72 });
        assert_eq!(dock_rect(FHD, 1.25, 800.0, 72.0, 0.0, Edge::Bottom), Rect { x: 460, y: 990, w: 1000, h: 90 });
        assert_eq!(dock_rect(FHD, 1.5, 800.0, 72.0, 0.0, Edge::Bottom), Rect { x: 360, y: 972, w: 1200, h: 108 });
    }

    #[test]
    fn monitor_with_offset_origin_is_respected() {
        let left = Rect { x: -1920, y: 200, w: 1920, h: 1080 };
        assert_eq!(dock_rect(left, 1.0, 1000.0, 72.0, 0.0, Edge::Bottom), Rect { x: -1460, y: 1208, w: 1000, h: 72 });
    }

    #[test]
    fn the_gap_lifts_the_window_instead_of_adding_a_dead_strip_to_it() {
        let r = dock_rect(FHD, 1.25, 800.0, 55.0, 6.0, Edge::Bottom);
        assert_eq!(r.h, 69, "only the bar");
        assert_eq!(r.y + r.h, 1080 - 8, "6 logical px above the edge at 125%");
    }

    #[test]
    fn floating_reserves_nothing_and_docked_reserves_bar_and_gap() {
        assert_eq!(reserved_height(DockLayout { width: 800.0, bar: 55.0, gap: 6.0, float: true, edge: Edge::Bottom }, 1.25), None);
        assert_eq!(reserved_height(DockLayout { width: 800.0, bar: 55.0, gap: 6.0, float: false, edge: Edge::Bottom }, 1.25), Some(77));
    }

    #[test]
    fn at_the_top_the_gap_is_above_the_window() {
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0, 0.0, Edge::Top), Rect { x: 560, y: 0, w: 800, h: 72 });
        assert_eq!(dock_rect(FHD, 1.25, 800.0, 72.0, 6.0, Edge::Top), Rect { x: 460, y: 8, w: 1000, h: 90 });
        assert_eq!(dock_rect(FHD, 1.5, 800.0, 72.0, 6.0, Edge::Top), Rect { x: 360, y: 9, w: 1200, h: 108 });
    }

    #[test]
    fn the_reserved_strip_follows_the_edge_and_the_monitor() {
        let m = Rect { x: -1920, y: 200, w: 1920, h: 1080 };
        assert_eq!(reserved_rect(m, 77, Edge::Bottom), (-1920, 1203, 0, 1280));
        assert_eq!(reserved_rect(m, 77, Edge::Top), (-1920, 200, 0, 277));
    }

    #[test]
    fn dragging_stays_on_the_monitor() {
        let r = Rect { x: 460, y: 1008, w: 1000, h: 72 };
        assert_eq!(dragged_y(r, FHD, 1.0, -300.0), 708);
        assert_eq!(dragged_y(r, FHD, 1.25, -100.0), 883);
        assert_eq!(dragged_y(r, FHD, 1.0, -5000.0), 0);
        assert_eq!(dragged_y(r, FHD, 1.0, 5000.0), 1008);
    }

    #[test]
    fn the_saved_edge_is_used_from_the_first_placement_and_full_width_sits_on_the_edge() {
        let top = saved_layout(Some(&serde_json::json!({ "edge": "top", "edgeGap": 10.0 })));
        assert_eq!((top.edge, top.gap), (Edge::Top, 10.0));
        let full = saved_layout(Some(&serde_json::json!({ "edgeGap": 10.0, "dockWidth": "full" })));
        assert_eq!((full.edge, full.gap), (Edge::Bottom, 0.0));
    }

    #[test]
    fn a_maximized_window_is_not_fullscreen() {
        // With nothing reserved, a maximized window overshoots the whole monitor.
        assert!(!is_fullscreen(true, true));
        assert!(is_fullscreen(true, false));
        assert!(!is_fullscreen(false, false));
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
