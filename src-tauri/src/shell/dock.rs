//! The dock window: where it sits, and how it reacts to the shell. Decisions live
//! in `react`, which is pure; `run_action` is the only part that touches Windows.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

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
use super::autohide::{self, AutoHide, Seen, Slide};
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
    /// Where a pill sits along its edge: 0 at the left end, 1 at the right, 0.5 in the middle.
    pub along: f64,
}

/// Near an edge of the monitor, `along` it, in physical pixels. The window is only as
/// tall as the bar: the gap stays outside it, so it can't swallow clicks.
pub fn dock_rect(monitor: Rect, scale: f64, logical_width: f64, bar: f64, gap: f64, edge: Edge, along: f64) -> Rect {
    let w = ((logical_width * scale).ceil() as i32).clamp(1, monitor.w);
    let h = (bar * scale).round() as i32;
    let lift = (gap * scale).round() as i32;
    let y = match edge {
        Edge::Bottom => monitor.y + monitor.h - lift - h,
        Edge::Top => monitor.y + lift,
    };
    let x = monitor.x + ((monitor.w - w) as f64 * along.clamp(0.0, 1.0)).round() as i32;
    Rect { x, y, w, h }
}

/// The strip of the screen to keep clear (left, top, right, bottom).
pub fn reserved_rect(monitor: Rect, height: i32, edge: Edge) -> (i32, i32, i32, i32) {
    let (left, right) = (monitor.x, monitor.x + monitor.w);
    match edge {
        Edge::Bottom => (left, monitor.y + monitor.h - height, right, monitor.y + monitor.h),
        Edge::Top => (left, monitor.y, right, monitor.y + height),
    }
}

/// Where the window goes while it's being dragged, `dx` and `dy` logical px from where it rests.
pub fn dragged(rest: Rect, monitor: Rect, scale: f64, dx: f64, dy: f64) -> (i32, i32) {
    (
        (rest.x + (dx * scale).round() as i32).clamp(monitor.x, monitor.x + monitor.w - rest.w),
        (rest.y + (dy * scale).round() as i32).clamp(monitor.y, monitor.y + monitor.h - rest.h),
    )
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
    Slide(Slide),
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Action {
    KeepTaskbar,
    RegisterAppbar,
    PlaceDock,
    RestartGlass,
    ShowDock,
    HideDock,
    Slide(Slide),
    Announce,
}

#[derive(Default)]
pub struct DockState {
    pub fullscreen: bool,
    pub locked: bool,
    /// Slid away by auto-hide: only auto-hide brings it back.
    pub autohidden: bool,
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
            if !state.fullscreen && !state.autohidden {
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
                if fullscreen {
                    actions.push(HideDock);
                } else if !state.autohidden {
                    actions.push(ShowDock);
                }
                actions.push(Announce);
            }
            actions
        }
        ShellEvent::Slide(slide) => {
            state.autohidden = slide == autohide::Slide::Out;
            vec![Action::Slide(slide), Announce]
        }
    }
}

/// With auto-hide on, the taskbar would slide up beside the dock, so it stays hidden whatever the owner chose.
pub fn taskbar_mode_for(chosen: Mode, auto_hide: bool) -> Mode {
    if auto_hide {
        Mode::Hidden
    } else {
        chosen
    }
}

/// A dock that slides away keeps no part of the screen.
pub fn reserved_with(layout: DockLayout, scale: f64, auto_hide: bool) -> Option<i32> {
    if auto_hide {
        None
    } else {
        reserved_height(layout, scale)
    }
}

/// Auto-hide, and whether the dock stays up over the desktop.
fn saved_behaviour(settings: Option<&serde_json::Value>) -> (bool, bool) {
    let flag = |key: &str| settings.and_then(|s| s[key].as_bool()).unwrap_or(false);
    (flag("autoHide"), flag("showOnDesktop"))
}

/// As last reported by the page; `start` fills it from the saved settings.
static LAYOUT: Mutex<DockLayout> = Mutex::new(DockLayout { width: 400.0, bar: 55.0, gap: 6.0, float: true, edge: Edge::Bottom, along: 0.5 });
/// Being dragged: the pointer decides where it is, and the glass waits until it lands.
static MOVING: AtomicBool = AtomicBool::new(false);
/// Sliding or slid away: auto-hide decides where it is.
static AWAY: AtomicBool = AtomicBool::new(false);
static AUTO_HIDE: AtomicBool = AtomicBool::new(false);
static SHOW_ON_DESKTOP: AtomicBool = AtomicBool::new(false);
/// Each slide gets a number, so a newer one stops an older one partway.
static SLIDES: AtomicIsize = AtomicIsize::new(0);
/// What the owner chose in Settings, before auto-hide has its say.
static CHOSEN_TASKBAR: Mutex<Mode> = Mutex::new(Mode::Hidden);
/// The dock's monitor, as last placed, so the pointer can be checked without asking the window.
static MONITOR: Mutex<Option<(Rect, f64)>> = Mutex::new(None);
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
    *MONITOR.lock().unwrap_or_else(|e| e.into_inner()) = Some((monitor, scale));
    let l = layout();
    let r = dock_rect(monitor, scale, l.width, l.bar, l.gap, l.edge, l.along);
    let _ = dock.set_size(PhysicalSize::new(r.w as u32, r.h as u32));
    if MOVING.load(Ordering::Relaxed) || AWAY.load(Ordering::Relaxed) {
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
    match reserved_with(l, scale, AUTO_HIDE.load(Ordering::Relaxed)) {
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
        Action::Slide(slide) => {
            let app = app.clone();
            std::thread::spawn(move || run_slide(&app, slide));
        }
        Action::Announce => {
            let status = events::status();
            glass::shell_changed(app, status.fullscreen, status.locked);
            glass::dock_hidden(app, status.autohidden);
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
        events::AUTOHIDDEN.store(state.autohidden, Ordering::Relaxed);
        for action in actions {
            run_action(&app, action);
        }
    }
}

/// Moves the window between its place and just past the edge, then hides it or settles it.
fn run_slide(app: &AppHandle, slide: Slide) {
    let Some(dock) = app.get_webview_window("dock") else { return };
    let Some((monitor, scale)) = *MONITOR.lock().unwrap_or_else(|e| e.into_inner()) else { return };
    let mine = SLIDES.fetch_add(1, Ordering::SeqCst) + 1;
    AWAY.store(true, Ordering::Relaxed);
    let l = layout();
    let rest = dock_rect(monitor, scale, l.width, l.bar, l.gap, l.edge, l.along);
    let at = |y: i32| dock.set_position(PhysicalPosition::new(rest.x, y));
    if slide == Slide::In {
        let _ = at(autohide::hidden_y(rest, monitor, l.edge));
        let _ = dock.show();
    }
    let started = Instant::now();
    loop {
        if SLIDES.load(Ordering::SeqCst) != mine {
            return;
        }
        let progress = started.elapsed().as_millis() as f64 / autohide::SLIDE_MS as f64;
        let _ = at(autohide::slide_y(rest, monitor, l.edge, slide, progress));
        if progress >= 1.0 {
            break;
        }
        std::thread::sleep(Duration::from_millis(8));
    }
    match slide {
        Slide::Out => {
            let _ = dock.hide();
        }
        Slide::In => {
            AWAY.store(false, Ordering::Relaxed);
            place(&dock);
        }
    }
}

/// What's going on for auto-hide, read from the pointer and the shell.
fn seen_now(app: &AppHandle) -> Option<Seen> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let (monitor, scale) = (*MONITOR.lock().unwrap_or_else(|e| e.into_inner()))?;
    let l = layout();
    let rest = dock_rect(monitor, scale, l.width, l.bar, l.gap, l.edge, l.along);
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p) }.ok()?;
    let busy = super::card::is_open()
        || crate::apps::previews::is_showing()
        || crate::system::tray::grid_open()
        || crate::apps::start_is_open()
        || app.get_webview_window("picker").is_some()
        || app.get_webview_window("settings").is_some()
        || MOVING.load(Ordering::Relaxed);
    Some(Seen {
        at_edge: autohide::at_edge(p.x, p.y, monitor, l.edge),
        on_dock: autohide::on_dock(p.x, p.y, rest, monitor, l.edge),
        busy,
        desktop: events::desktop_in_front(),
        fullscreen: events::FULLSCREEN.load(Ordering::Relaxed),
        locked: events::LOCKED.load(Ordering::Relaxed),
    })
}

/// Samples often while auto-hide is on, and rests while it's off.
fn watch_pointer(app: AppHandle, tx: Sender<ShellEvent>) {
    let mut auto = AutoHide::default();
    let started = Instant::now();
    loop {
        let slide = if AUTO_HIDE.load(Ordering::Relaxed) {
            seen_now(&app).and_then(|seen| auto.decide(seen, SHOW_ON_DESKTOP.load(Ordering::Relaxed), started.elapsed().as_millis() as u64))
        } else {
            auto.reveal()
        };
        if let Some(slide) = slide {
            if tx.send(ShellEvent::Slide(slide)).is_err() {
                return;
            }
        }
        let on = AUTO_HIDE.load(Ordering::Relaxed);
        std::thread::sleep(Duration::from_millis(if on { 60 } else { 250 }));
    }
}

fn apply_taskbar() {
    if crate::preview::current().touch_taskbar {
        let chosen = *CHOSEN_TASKBAR.lock().unwrap_or_else(|e| e.into_inner());
        TASKBAR.apply(taskbar_mode_for(chosen, AUTO_HIDE.load(Ordering::Relaxed)));
    }
}

/// The taskbar setting, from Settings. Auto-hide may still keep it hidden.
pub fn choose_taskbar_mode(mode: Mode) {
    *CHOSEN_TASKBAR.lock().unwrap_or_else(|e| e.into_inner()) = mode;
    apply_taskbar();
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
        l.along = s["pillAt"].as_f64().map_or(l.along, |at| at.clamp(0.0, 1.0));
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
    let (auto_hide, show_on_desktop) = saved_behaviour(settings.as_ref());
    AUTO_HIDE.store(auto_hide, Ordering::Relaxed);
    SHOW_ON_DESKTOP.store(show_on_desktop, Ordering::Relaxed);
    *CHOSEN_TASKBAR.lock().unwrap_or_else(|e| e.into_inner()) = saved_taskbar_mode(settings.as_ref());
    apply_taskbar();
    *LAYOUT.lock().unwrap_or_else(|e| e.into_inner()) = saved_layout(settings.as_ref());

    let hwnd = dock.hwnd()?;
    DOCK_HWND.store(hwnd.0 as isize, Ordering::Relaxed);
    let (tx, rx) = channel();
    let pointer_tx = tx.clone();
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
    let handle = app.clone();
    std::thread::spawn(move || watch_pointer(handle, pointer_tx));
    Ok(())
}

/// Auto-hide and its desktop option, from Settings.
#[tauri::command]
pub fn set_dock_behaviour(app: AppHandle, auto_hide: bool, show_on_desktop: bool) -> Result<(), String> {
    SHOW_ON_DESKTOP.store(show_on_desktop, Ordering::Relaxed);
    if AUTO_HIDE.swap(auto_hide, Ordering::Relaxed) != auto_hide {
        apply_taskbar();
        let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
        register_appbar(&dock);
    }
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
pub fn set_dock_width(app: AppHandle, width: f64, bar: f64, gap: f64, float: bool, edge: String, along: f64) -> Result<(), String> {
    let edge = Edge::from_name(Some(&edge));
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let edge_changed = {
        let mut current = LAYOUT.lock().unwrap_or_else(|e| e.into_inner());
        let changed = current.bar != bar || current.gap != gap || current.float != float || current.edge != edge;
        *current = DockLayout { width, bar, gap, float, edge, along };
        changed
    };
    if edge_changed {
        register_appbar(&dock);
    }
    place(&dock);
    Ok(())
}

/// The dock follows the pointer, `dx` and `dy` logical px from where it rests.
#[tauri::command]
pub fn dock_drag(app: AppHandle, dx: f64, dy: f64) -> Result<(), String> {
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let (monitor, scale) = monitor_rect(&dock).ok_or("no monitor")?;
    let l = layout();
    let rest = dock_rect(monitor, scale, l.width, l.bar, l.gap, l.edge, l.along);
    MOVING.store(true, Ordering::Relaxed);
    let (x, y) = dragged(rest, monitor, scale, dx, dy);
    dock.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())
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
        let r = dock_rect(FHD, 1.0, 1000.0, 72.0, 0.0, Edge::Bottom, 0.5);
        assert_eq!(r, Rect { x: 460, y: 1008, w: 1000, h: 72 });
    }

    #[test]
    fn dock_never_exceeds_monitor_width() {
        let r = dock_rect(FHD, 1.0, 5000.0, 72.0, 0.0, Edge::Bottom, 0.5);
        assert_eq!((r.x, r.w), (0, 1920));
    }

    #[test]
    fn dock_rect_is_correct_at_100_125_150_percent() {
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0, 0.0, Edge::Bottom, 0.5), Rect { x: 560, y: 1008, w: 800, h: 72 });
        assert_eq!(dock_rect(FHD, 1.25, 800.0, 72.0, 0.0, Edge::Bottom, 0.5), Rect { x: 460, y: 990, w: 1000, h: 90 });
        assert_eq!(dock_rect(FHD, 1.5, 800.0, 72.0, 0.0, Edge::Bottom, 0.5), Rect { x: 360, y: 972, w: 1200, h: 108 });
    }

    #[test]
    fn monitor_with_offset_origin_is_respected() {
        let left = Rect { x: -1920, y: 200, w: 1920, h: 1080 };
        assert_eq!(dock_rect(left, 1.0, 1000.0, 72.0, 0.0, Edge::Bottom, 0.5), Rect { x: -1460, y: 1208, w: 1000, h: 72 });
    }

    #[test]
    fn a_pill_sits_wherever_it_was_put_along_its_edge() {
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0, 0.0, Edge::Bottom, 0.0).x, 0);
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0, 0.0, Edge::Bottom, 1.0).x, 1120);
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0, 0.0, Edge::Top, 0.25).x, 280);
        let left = Rect { x: -1920, y: 0, w: 1920, h: 1080 };
        assert_eq!(dock_rect(left, 1.0, 800.0, 72.0, 0.0, Edge::Bottom, 1.0).x, -800);
        assert_eq!(dock_rect(FHD, 1.0, 1920.0, 72.0, 0.0, Edge::Bottom, 0.9).x, 0, "full width has nowhere to go");
    }

    #[test]
    fn the_saved_spot_along_the_edge_is_used_from_the_start_and_kept_on_screen() {
        assert_eq!(saved_layout(Some(&serde_json::json!({ "pillAt": 0.2 }))).along, 0.2);
        assert_eq!(saved_layout(Some(&serde_json::json!({ "pillAt": 7.0 }))).along, 1.0);
        assert_eq!(saved_layout(None).along, 0.5);
    }

    #[test]
    fn the_gap_lifts_the_window_instead_of_adding_a_dead_strip_to_it() {
        let r = dock_rect(FHD, 1.25, 800.0, 55.0, 6.0, Edge::Bottom, 0.5);
        assert_eq!(r.h, 69, "only the bar");
        assert_eq!(r.y + r.h, 1080 - 8, "6 logical px above the edge at 125%");
    }

    #[test]
    fn floating_reserves_nothing_and_docked_reserves_bar_and_gap() {
        assert_eq!(reserved_height(DockLayout { width: 800.0, bar: 55.0, gap: 6.0, float: true, edge: Edge::Bottom, along: 0.5 }, 1.25), None);
        assert_eq!(reserved_height(DockLayout { width: 800.0, bar: 55.0, gap: 6.0, float: false, edge: Edge::Bottom, along: 0.5 }, 1.25), Some(77));
    }

    #[test]
    fn at_the_top_the_gap_is_above_the_window() {
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0, 0.0, Edge::Top, 0.5), Rect { x: 560, y: 0, w: 800, h: 72 });
        assert_eq!(dock_rect(FHD, 1.25, 800.0, 72.0, 6.0, Edge::Top, 0.5), Rect { x: 460, y: 8, w: 1000, h: 90 });
        assert_eq!(dock_rect(FHD, 1.5, 800.0, 72.0, 6.0, Edge::Top, 0.5), Rect { x: 360, y: 9, w: 1200, h: 108 });
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
        assert_eq!(dragged(r, FHD, 1.0, 0.0, -300.0).1, 708);
        assert_eq!(dragged(r, FHD, 1.25, 0.0, -100.0).1, 883);
        assert_eq!(dragged(r, FHD, 1.0, 0.0, -5000.0).1, 0);
        assert_eq!(dragged(r, FHD, 1.0, 0.0, 5000.0).1, 1008);
        assert_eq!(dragged(r, FHD, 1.0, -200.0, 0.0), (260, 1008));
        assert_eq!(dragged(r, FHD, 1.25, 100.0, 0.0).0, 585);
        assert_eq!(dragged(r, FHD, 1.0, -5000.0, 0.0).0, 0);
        assert_eq!(dragged(r, FHD, 1.0, 5000.0, 0.0).0, 920);
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
        let mut state = DockState { fullscreen: true, locked: false, ..Default::default() };
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
    fn waking_from_sleep_leaves_an_auto_hidden_dock_hidden() {
        let mut state = DockState { autohidden: true, ..Default::default() };
        assert!(!react(ShellEvent::Resume, &mut state).contains(&Action::ShowDock));
    }

    #[test]
    fn leaving_fullscreen_leaves_an_auto_hidden_dock_hidden() {
        let mut state = DockState { autohidden: true, ..Default::default() };
        react(ShellEvent::Tick { fullscreen: true }, &mut state);
        let left = react(ShellEvent::Tick { fullscreen: false }, &mut state);
        assert!(!left.contains(&Action::ShowDock));
        assert!(left.contains(&Action::Announce));
    }

    #[test]
    fn sliding_is_remembered_and_announced() {
        let mut state = DockState::default();
        let out = react(ShellEvent::Slide(Slide::Out), &mut state);
        assert_eq!(out, vec![Action::Slide(Slide::Out), Action::Announce]);
        assert!(state.autohidden);
        let back = react(ShellEvent::Slide(Slide::In), &mut state);
        assert_eq!(back, vec![Action::Slide(Slide::In), Action::Announce]);
        assert!(!state.autohidden);
    }

    #[test]
    fn auto_hide_keeps_the_taskbar_hidden_without_changing_the_choice() {
        assert_eq!(taskbar_mode_for(Mode::Autohide, true), Mode::Hidden);
        assert_eq!(taskbar_mode_for(Mode::Autohide, false), Mode::Autohide);
        assert_eq!(taskbar_mode_for(Mode::Hidden, false), Mode::Hidden);
    }

    #[test]
    fn auto_hide_reserves_nothing() {
        let docked = DockLayout { width: 800.0, bar: 55.0, gap: 6.0, float: false, edge: Edge::Bottom, along: 0.5 };
        assert_eq!(reserved_with(docked, 1.25, true), None);
        assert_eq!(reserved_with(docked, 1.25, false), Some(77));
    }

    #[test]
    fn the_saved_auto_hide_choice_is_used_from_the_start() {
        assert_eq!(saved_behaviour(Some(&serde_json::json!({ "autoHide": true, "showOnDesktop": true }))), (true, true));
        assert_eq!(saved_behaviour(None), (false, false));
    }

    #[test]
    fn locking_only_announces() {
        let mut state = DockState::default();
        assert_eq!(react(ShellEvent::Lock, &mut state), vec![Action::Announce]);
        assert!(state.locked);
    }

    #[test]
    fn unlocking_reasserts_after_explorer_may_have_moved_things() {
        let mut state = DockState { fullscreen: false, locked: true, ..Default::default() };
        let actions = react(ShellEvent::Unlock, &mut state);
        assert!(!state.locked);
        assert!(actions.contains(&Action::PlaceDock) && actions.contains(&Action::Announce));
    }
}
