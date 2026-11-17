//! The dock window: where it sits, and how it reacts to the shell. Decisions live
//! in `react`, which is pure; `run_action` is the only part that touches Windows.

mod extras;
mod follow;
mod geometry;
pub mod many;
mod saved;
mod state;

pub use geometry::*;
pub use state::*;
use follow::Follow;
use saved::{saved_behaviour, saved_display, saved_layout, saved_taskbar_mode};

use crate::util::lock;
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
use super::displays::{self, dock_display, Display, DisplayMode};
use super::autohide::{self, AutoHide, Seen, Slide};
use super::events;
use super::taskbar::{Mode, TASKBAR};

const PBT_APMRESUMESUSPEND: usize = 0x7;
const PBT_APMRESUMEAUTOMATIC: usize = 0x12;
const WTS_SESSION_LOCK: usize = 0x7;
const WTS_SESSION_UNLOCK: usize = 0x8;
const ABN_POSCHANGED: usize = 0x1;

/// Everything the dock's window, its two threads and its commands share. The flags stay atomics:
/// Windows' message loop reads some of them, and nothing there should wait on a lock.
struct Shared {
    /// As last reported by the page; `start` fills it from the saved settings.
    layout: Mutex<DockLayout>,
    /// Being dragged: the pointer decides where it is, and the glass waits until it lands.
    moving: AtomicBool,
    /// Something dragged from Windows is over the dock.
    os_drag: AtomicBool,
    /// Sliding or slid away: auto-hide decides where it is.
    away: AtomicBool,
    auto_hide: AtomicBool,
    show_on_desktop: AtomicBool,
    /// Each slide gets a number, so a newer one stops an older one partway.
    slides: AtomicIsize,
    /// What the owner chose in Settings, before auto-hide has its say.
    chosen_taskbar: Mutex<Mode>,
    /// The dock's monitor, as last placed, so the pointer can be checked without asking the window.
    monitor: Mutex<Option<(Rect, f64)>>,
    /// The screens as Windows last described them: read again only when they may have changed.
    displays: Mutex<Vec<Display>>,
    display_mode: Mutex<DisplayMode>,
    /// The screen picked in Settings; None for the main one.
    chosen_display: Mutex<Option<String>>,
    /// With Follow: the screen the pointer last asked for.
    followed: Mutex<Option<String>>,
    /// The monitor the edge was last reserved on, so a move to another one drops the old strip.
    appbar_on: Mutex<Option<Strip>>,
    hwnd: AtomicIsize,
    events: OnceLock<Sender<ShellEvent>>,
    taskbar_created: OnceLock<u32>,
    /// Whether something open on screen should keep the dock up, as the rest of Shelf knows it.
    busy: OnceLock<fn(&AppHandle) -> bool>,
}

static DOCK: Shared = Shared {
    layout: Mutex::new(FIRST_LAYOUT),
    moving: AtomicBool::new(false),
    os_drag: AtomicBool::new(false),
    away: AtomicBool::new(false),
    auto_hide: AtomicBool::new(false),
    show_on_desktop: AtomicBool::new(false),
    slides: AtomicIsize::new(0),
    chosen_taskbar: Mutex::new(Mode::Hidden),
    monitor: Mutex::new(None),
    displays: Mutex::new(Vec::new()),
    display_mode: Mutex::new(DisplayMode::Single),
    chosen_display: Mutex::new(None),
    followed: Mutex::new(None),
    appbar_on: Mutex::new(None),
    hwnd: AtomicIsize::new(0),
    events: OnceLock::new(),
    taskbar_created: OnceLock::new(),
    busy: OnceLock::new(),
};

pub fn os_drag(on: bool) {
    DOCK.os_drag.store(on, Ordering::Relaxed);
}

/// Where the dock rests on this monitor, as its layout says.
fn resting_rect(monitor: Rect, scale: f64) -> Rect {
    resting_on(monitor, scale, layout())
}

/// Where the main dock rests, on which screen and edge, at what scale: what a toast is placed from.
pub(crate) fn resting() -> Option<(Rect, Rect, Edge, f64)> {
    let (monitor, scale) = monitor()?;
    Some((monitor, resting_rect(monitor, scale), layout().edge, scale))
}

fn layout() -> DockLayout {
    *lock(&DOCK.layout)
}

/// The screen the dock belongs on: the one chosen, or with Follow the one the pointer asked for.
fn target(displays: &[Display]) -> Option<&Display> {
    let chosen = lock(&DOCK.chosen_display).clone();
    let wanted = match *lock(&DOCK.display_mode) {
        DisplayMode::Follow => lock(&DOCK.followed).clone().or(chosen),
        // With a dock on every screen, this one is the main screen's.
        DisplayMode::All => None,
        DisplayMode::Single => chosen,
    };
    dock_display(displays, wanted.as_deref())
}

fn target_monitor() -> Option<(Rect, f64)> {
    let displays = lock(&DOCK.displays);
    target(&displays).map(|d| (d.rect, d.scale))
}

/// The dock's monitor as last placed, and its scale.
pub fn monitor() -> Option<(Rect, f64)> {
    *lock(&DOCK.monitor)
}

/// The monitor and scale of any of the docks, by window label.
pub fn monitor_of(label: &str) -> Option<(Rect, f64)> {
    if label == many::MAIN {
        monitor()
    } else {
        extras::monitor_of(label)
    }
}

fn read_displays(app: &AppHandle) {
    *lock(&DOCK.displays) = displays::list();
    let _ = app.emit("displays-changed", ());
}

fn place(dock: &WebviewWindow) {
    let Some((monitor, scale)) = target_monitor() else { return };
    *lock(&DOCK.monitor) = Some((monitor, scale));
    // Before the early return, so the taskbar follows a dock that's slid away too.
    TASKBAR.set_docked(extras::docked_monitors(monitor));
    let r = resting_rect(monitor, scale);
    if DOCK.moving.load(Ordering::Relaxed) || DOCK.away.load(Ordering::Relaxed) {
        let _ = dock.set_size(PhysicalSize::new(r.w as u32, r.h as u32));
        return;
    }
    let _ = super::windows::put(dock, r);
    glass::set_region(dock.app_handle(), Region { x: r.x, y: r.y, w: r.w, h: r.h });
}

/// The reserved edge stays the monitor's full width, so maximized windows
/// keep stopping short of the bar however narrow the bar is.
fn register_appbar(dock: &WebviewWindow) {
    let _ = dock;
    let Some((m, scale)) = target_monitor() else { return };
    if !crate::preview::current().reserve_edge {
        return;
    }
    let raw = DOCK.hwnd.load(Ordering::Relaxed);
    let l = layout();
    let mut on = lock(&DOCK.appbar_on);
    match reserved_with(l, scale, DOCK.auto_hide.load(Ordering::Relaxed)) {
        Some(h) => {
            let strip = reserved_rect(m, h, l.edge);
            if !reserve_again(*on, (m, strip)) {
                return;
            }
            // Setting a new position on another monitor leaves the old strip reserved.
            if on.is_some_and(|(was, _)| was != m) {
                appbar::unregister(raw);
            }
            appbar::register(raw, strip, l.edge);
            *on = Some((m, strip));
            super::boot::note_reserved();
        }
        None => {
            appbar::unregister(raw);
            *on = None;
        }
    }
}

fn run_action(app: &AppHandle, action: Action) {
    if action == Action::KeepTaskbar {
        TASKBAR.keep();
        return;
    }
    if action == Action::ForgetAppbar {
        *lock(&DOCK.appbar_on) = None;
        extras::forget_reserved();
        return;
    }
    if action == Action::ReadDisplays {
        read_displays(app);
        extras::sync(app);
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
        Action::KeepTaskbar | Action::ReadDisplays | Action::ForgetAppbar => {}
    }
}

fn watch(app: AppHandle, rx: std::sync::mpsc::Receiver<ShellEvent>) {
    let mut state = DockState::default();
    let mut tracker = events::FullscreenTracker::default();
    let mut extra_trackers = std::collections::HashMap::new();
    loop {
        let event = match rx.recv_timeout(Duration::from_secs(1)) {
            Ok(event) => event,
            Err(RecvTimeoutError::Timeout) => {
                let raw = DOCK.hwnd.load(Ordering::Relaxed);
                ShellEvent::Tick { fullscreen: tracker.sample(raw) }
            }
            Err(RecvTimeoutError::Disconnected) => return,
        };
        if matches!(event, ShellEvent::Tick { .. }) {
            extras::tick(&app, &mut extra_trackers);
        }
        let actions = react(event, &mut state);
        events::FULLSCREEN.store(state.fullscreen, Ordering::Relaxed);
        events::LOCKED.store(state.locked, Ordering::Relaxed);
        events::AUTOHIDDEN.store(state.autohidden, Ordering::Relaxed);
        if state.fullscreen || state.locked {
            super::keys::cancel();
        }
        if state.locked {
            super::keys::forget_held();
        }
        for action in actions {
            run_action(&app, action);
        }
    }
}

/// Moves the window between its place and just past the edge, then hides it or settles it.
fn run_slide(app: &AppHandle, slide: Slide) {
    let Some(dock) = app.get_webview_window("dock") else { return };
    let Some((monitor, scale)) = *lock(&DOCK.monitor) else { return };
    let mine = DOCK.slides.fetch_add(1, Ordering::SeqCst) + 1;
    DOCK.away.store(true, Ordering::Relaxed);
    let l = layout();
    let rest = resting_rect(monitor, scale);
    let at = |y: i32| dock.set_position(PhysicalPosition::new(rest.x, y));
    if slide == Slide::In {
        let _ = at(autohide::hidden_y(rest, monitor, l.edge));
        let _ = dock.show();
    }
    let started = Instant::now();
    loop {
        if DOCK.slides.load(Ordering::SeqCst) != mine {
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
            DOCK.away.store(false, Ordering::Relaxed);
            place(&dock);
        }
    }
}

/// What's going on for auto-hide, read from the pointer and the shell.
fn seen_now(app: &AppHandle) -> Option<Seen> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let (monitor, scale) = (*lock(&DOCK.monitor))?;
    let l = layout();
    let rest = resting_rect(monitor, scale);
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p) }.ok()?;
    let busy = DOCK.busy.get().is_some_and(|open| open(app)) || DOCK.moving.load(Ordering::Relaxed) || DOCK.os_drag.load(Ordering::Relaxed);
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
/// With Follow: the screen whose edge the pointer has been held at, if it isn't the dock's own.
/// Never during a game, a locked session or a drag.
fn followed_to(follow: &mut Follow, now: u64) -> Option<String> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let busy = DOCK.moving.load(Ordering::Relaxed) || DOCK.os_drag.load(Ordering::Relaxed);
    if busy || events::FULLSCREEN.load(Ordering::Relaxed) || events::LOCKED.load(Ordering::Relaxed) {
        return None;
    }
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p) }.ok()?;
    // A copy, so no lock is held while the others are taken.
    let displays = lock(&DOCK.displays).clone();
    let current = target(&displays)?.id.clone();
    follow.decide((p.x, p.y), &displays, &current, layout().edge, now)
}

fn following() -> bool {
    *lock(&DOCK.display_mode) == DisplayMode::Follow
}

fn watch_pointer(app: AppHandle, tx: Sender<ShellEvent>) {
    let mut auto = AutoHide::default();
    let mut follow = Follow::default();
    let started = Instant::now();
    loop {
        if following() {
            if let Some(id) = followed_to(&mut follow, started.elapsed().as_millis() as u64) {
                *lock(&DOCK.followed) = Some(id);
                // Moving screens is what a display change already does: reserve, place, glass, taskbar.
                if tx.send(ShellEvent::DisplayChange).is_err() {
                    return;
                }
            }
        }
        let slide = if DOCK.auto_hide.load(Ordering::Relaxed) {
            seen_now(&app).and_then(|seen| auto.decide(seen, DOCK.show_on_desktop.load(Ordering::Relaxed), started.elapsed().as_millis() as u64))
        } else {
            auto.reveal()
        };
        if let Some(slide) = slide {
            if tx.send(ShellEvent::Slide(slide)).is_err() {
                return;
            }
        }
        // Win+T the dock never answered ends by itself, so arrows go back to the app in front.
        if super::keys::navigating() && super::keys::idle_too_long() {
            super::keys::cancel();
        }
        let on = DOCK.auto_hide.load(Ordering::Relaxed) || following() || super::keys::navigating();
        std::thread::sleep(Duration::from_millis(if on { 60 } else { 250 }));
    }
}

fn apply_taskbar() {
    if crate::preview::current().touch_taskbar {
        let chosen = *lock(&DOCK.chosen_taskbar);
        TASKBAR.apply(taskbar_mode_for(chosen, DOCK.auto_hide.load(Ordering::Relaxed)));
    }
}

/// The taskbar setting, from Settings. Auto-hide may still keep it hidden.
pub fn choose_taskbar_mode(mode: Mode) {
    *lock(&DOCK.chosen_taskbar) = mode;
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
        m if Some(&m) == DOCK.taskbar_created.get() => Some(ShellEvent::TaskbarCreated),
        _ => None,
    };
    if let (Some(event), Some(tx)) = (event, DOCK.events.get()) {
        let _ = tx.send(event);
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

/// Hides the taskbar, reserves the edge and shows the dock. Runs on the main thread.
/// `busy` says whether something open on screen, such as a card or Start, should keep the dock up.
pub fn start(app: &AppHandle, busy: fn(&AppHandle) -> bool) -> Result<(), Box<dyn std::error::Error>> {
    let _ = DOCK.busy.set(busy);
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let settings = crate::store::load(crate::store::SETTINGS);
    let (auto_hide, show_on_desktop) = saved_behaviour(settings.as_ref());
    DOCK.auto_hide.store(auto_hide, Ordering::Relaxed);
    DOCK.show_on_desktop.store(show_on_desktop, Ordering::Relaxed);
    *lock(&DOCK.chosen_taskbar) = saved_taskbar_mode(settings.as_ref());
    let (mode, chosen) = saved_display(settings.as_ref());
    *lock(&DOCK.display_mode) = mode;
    *lock(&DOCK.chosen_display) = chosen;
    *lock(&DOCK.displays) = displays::list();
    // Known before the taskbar is first hidden, so the screen with the dock is the one that loses it.
    if let Some((monitor, _)) = target_monitor() {
        TASKBAR.set_docked(vec![monitor]);
    }
    apply_taskbar();
    *lock(&DOCK.layout) = saved_layout(settings.as_ref(), layout());

    let hwnd = dock.hwnd()?;
    DOCK.hwnd.store(hwnd.0 as isize, Ordering::Relaxed);
    let (tx, rx) = channel();
    let pointer_tx = tx.clone();
    let _ = DOCK.events.set(tx);
    let _ = DOCK.taskbar_created.set(unsafe { RegisterWindowMessageW(w!("TaskbarCreated")) });
    unsafe {
        // Clicking the dock mustn't take focus from your app, as with the real taskbar.
        let style = GetWindowLongPtrW(HWND(hwnd.0), GWL_EXSTYLE);
        SetWindowLongPtrW(HWND(hwnd.0), GWL_EXSTYLE, style | WS_EX_NOACTIVATE.0 as isize);
        let _ = SetWindowSubclass(HWND(hwnd.0), Some(on_message), 1, 0);
        let _ = WTSRegisterSessionNotification(HWND(hwnd.0), NOTIFY_FOR_THIS_SESSION);
    }

    register_appbar(&dock);
    place(&dock);
    dock.show()?;

    let handle = app.clone();
    std::thread::spawn(move || watch(handle, rx));
    let handle = app.clone();
    std::thread::spawn(move || watch_pointer(handle, pointer_tx));
    // Reads the screens once more off the main thread, which also opens the extra docks of All screens.
    if let Some(tx) = DOCK.events.get() {
        let _ = tx.send(ShellEvent::DisplayChange);
    }
    Ok(())
}

/// Which screen the dock sits on, from Settings: `mode` is "single" or "follow", `monitor` the
/// chosen screen's id, or None for the main one.
#[tauri::command]
pub fn set_dock_display(mode: String, monitor: Option<String>) -> Result<(), String> {
    let mode = DisplayMode::from_name(Some(&mode));
    // A return to Follow starts from the chosen screen, not where the pointer last took it.
    if std::mem::replace(&mut *lock(&DOCK.display_mode), mode) != mode {
        *lock(&DOCK.followed) = None;
    }
    *lock(&DOCK.chosen_display) = monitor;
    if let Some(tx) = DOCK.events.get() {
        let _ = tx.send(ShellEvent::DisplayChange);
    }
    Ok(())
}

/// Auto-hide and its desktop option, from Settings.
#[tauri::command]
pub fn set_dock_behaviour(app: AppHandle, auto_hide: bool, show_on_desktop: bool) -> Result<(), String> {
    DOCK.show_on_desktop.store(show_on_desktop, Ordering::Relaxed);
    if DOCK.auto_hide.swap(auto_hide, Ordering::Relaxed) != auto_hide {
        apply_taskbar();
        let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
        register_appbar(&dock);
    }
    Ok(())
}

pub fn stop() {
    let raw = DOCK.hwnd.load(Ordering::Relaxed);
    if raw != 0 {
        appbar::unregister(raw);
    }
    crate::preview::restore_taskbar(|| TASKBAR.restore());
}

/// Fits the window to the bar. Anything but a new width also changes what's reserved.
#[tauri::command]
pub fn set_dock_width(window: WebviewWindow, width: f64, bar: f64, gap: f64, float: bool, edge: String, along: f64) -> Result<(), String> {
    let app = window.app_handle().clone();
    // An extra dock shares the main one's layout, and has only its own width to report.
    if window.label() != many::MAIN {
        extras::set_width(&app, window.label(), width);
        return Ok(());
    }
    let edge = Edge::from_name(Some(&edge));
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let edge_changed = {
        let mut current = lock(&DOCK.layout);
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
pub fn dock_drag(app: AppHandle, window: WebviewWindow, dx: f64, dy: f64) -> Result<(), String> {
    // Only the main dock is moved by hand; the extras follow its settings.
    if window.label() != many::MAIN {
        return Ok(());
    }
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let (monitor, scale) = monitor().ok_or("no monitor")?;
    let rest = resting_rect(monitor, scale);
    DOCK.moving.store(true, Ordering::Relaxed);
    let (x, y) = dragged(rest, monitor, scale, dx, dy);
    dock.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct Settled {
    edge: &'static str,
    along: f64,
}

/// Where the dock would settle if let go now, read from the window itself and the screen it's on,
/// so a dock on another screen settles on that one. Moves nothing: the page saves this first.
#[tauri::command]
pub fn dock_drag_settle(app: AppHandle, window: WebviewWindow) -> Result<Settled, String> {
    if window.label() != many::MAIN {
        return Err("only the main dock is moved by hand".into());
    }
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let (monitor, _) = monitor().ok_or("no monitor")?;
    let (pos, size) = (dock.outer_position().map_err(|e| e.to_string())?, dock.outer_size().map_err(|e| e.to_string())?);
    let (edge, along) = settle(Rect { x: pos.x, y: pos.y, w: size.width as i32, h: size.height as i32 }, monitor);
    Ok(Settled { edge: if edge == Edge::Top { "top" } else { "bottom" }, along })
}

/// Let go: it goes back to where its layout says.
#[tauri::command]
pub fn dock_drag_end(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if window.label() != many::MAIN {
        return Ok(());
    }
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    DOCK.moving.store(false, Ordering::Relaxed);
    place(&dock);
    Ok(())
}
