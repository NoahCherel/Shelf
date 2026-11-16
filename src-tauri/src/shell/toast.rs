//! Toasts: short notices above the dock, from any page (F-073). They wait out quiet hours, a
//! fullscreen game and a locked screen, then show one at a time.

use std::collections::VecDeque;
use std::ffi::c_void;
use std::sync::atomic::Ordering;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE};

use super::dock::{Edge, Rect};
use super::events;
use crate::util::lock;

const LABEL: &str = "toast";
/// Logical px.
const TOAST_WIDTH: f64 = 340.0;
const MARGIN: f64 = 12.0;
/// How often held toasts are looked at again, as quiet hours or a game end.
const RECHECK: Duration = Duration::from_secs(30);

/// Longer than any quiet hours, so what was held does come out when they end.
pub const HOLD_MAX_MS: u64 = 24 * 3_600_000;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Toast {
    pub id: String,
    pub title: String,
    pub body: String,
    pub action: Option<ToastAction>,
    pub sound: bool,
    /// Ms since 1970 after which it says something no longer true, as a limit that has reset.
    pub expires_at: Option<u64>,
}

/// A button that asks the dock to open something, as `open-request` does: `widget:<id>` or `panel:<id>`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToastAction {
    pub label: String,
    pub target: String,
}

/// Minutes since midnight. A range whose start is after its end runs past midnight; an empty one is never quiet.
#[allow(dead_code)] // The gate reads it once quiet hours are a setting.
pub fn quiet(now_min: u16, from_min: u16, to_min: u16) -> bool {
    if from_min <= to_min {
        (from_min..to_min).contains(&now_min)
    } else {
        now_min >= from_min || now_min < to_min
    }
}

/// What keeps toasts waiting.
#[derive(Clone, Copy, Default)]
pub struct Gate {
    pub quiet: bool,
    pub fullscreen: bool,
    pub locked: bool,
}

impl Gate {
    fn open(&self) -> bool {
        !(self.quiet || self.fullscreen || self.locked)
    }
}

/// Toasts waiting their turn, oldest first, each with when it arrived.
#[derive(Default)]
pub struct Toasts {
    waiting: VecDeque<(Toast, u64)>,
}

impl Toasts {
    /// One with the id of a toast already waiting takes its place: only the latest news is worth showing.
    pub fn push(&mut self, toast: Toast, now_ms: u64) {
        match self.waiting.iter_mut().find(|(t, _)| t.id == toast.id) {
            Some(slot) => *slot = (toast, now_ms),
            None => self.waiting.push_back((toast, now_ms)),
        }
    }

    pub fn next(&mut self, gate: Gate, now_ms: u64) -> Option<Toast> {
        self.waiting.retain(|(t, at)| now_ms.saturating_sub(*at) <= HOLD_MAX_MS && t.expires_at.is_none_or(|end| now_ms <= end));
        if !gate.open() {
            return None;
        }
        self.waiting.pop_front().map(|(t, _)| t)
    }

    pub fn is_empty(&self) -> bool {
        self.waiting.is_empty()
    }
}

/// Against the screen's right side, on the screen side of the dock. `dock` is where the dock rests,
/// so a dock slid away by auto-hide doesn't move the toast. Kept on the screen.
pub fn toast_rect(monitor: Rect, dock: Rect, edge: Edge, size: (i32, i32), margin: i32) -> Rect {
    let (w, h) = size;
    let x = (monitor.x + monitor.w - w - margin).max(monitor.x);
    let y = match edge {
        Edge::Bottom => dock.y - margin - h,
        Edge::Top => dock.y + dock.h + margin,
    };
    let y = y.min(monitor.y + monitor.h - h).max(monitor.y);
    Rect { x, y, w, h }
}

#[derive(Default)]
struct State {
    queue: Toasts,
    /// The toast on screen, apart from those waiting.
    current: Option<Toast>,
}

static STATE: LazyLock<Mutex<State>> = LazyLock::new(|| Mutex::new(State::default()));

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn gate() -> Gate {
    Gate { quiet: false, fullscreen: events::FULLSCREEN.load(Ordering::Relaxed), locked: events::LOCKED.load(Ordering::Relaxed) }
}

/// Puts the next toast on screen if none is, and the gate lets one through.
fn pump(app: &AppHandle) {
    let next = {
        let mut state = lock(&STATE);
        if state.current.is_some() {
            return;
        }
        let next = state.queue.next(gate(), now_ms());
        state.current.clone_from(&next);
        next
    };
    let Some(toast) = next else { return };
    match app.get_webview_window(LABEL) {
        Some(_) => {
            let _ = app.emit_to(LABEL, "toast-show", &toast);
        }
        // The new page asks for it with toast_current.
        None => open_window(app),
    }
}

fn open_window(app: &AppHandle) {
    let built = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html?w=toast".into()))
        .title("Shelf toast")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .shadow(false)
        .focused(false)
        .visible(false)
        .position(-32000.0, -32000.0)
        // Never sized to nothing: WebView2 puts such a page to sleep.
        .inner_size(TOAST_WIDTH, 120.0)
        .additional_browser_args(super::windows::BROWSER_ARGS)
        .build();
    let window = match built {
        Ok(window) => window,
        Err(e) => {
            crate::diag::note(&format!("the toast window could not open: {e}"));
            lock(&STATE).current = None;
            return;
        }
    };
    let Ok(hwnd) = window.hwnd() else { return };
    let raw = hwnd.0 as isize;
    // Showing a toast mustn't take the focus from your app.
    let _ = app.run_on_main_thread(move || unsafe {
        let h = HWND(raw as *mut c_void);
        let style = GetWindowLongPtrW(h, GWL_EXSTYLE);
        SetWindowLongPtrW(h, GWL_EXSTYLE, style | WS_EX_NOACTIVATE.0 as isize);
    });
}

/// Async: it may make a window, and making one in a synchronous command deadlocks WebView2.
#[tauri::command(async)]
pub fn toast_show(app: AppHandle, toast: Toast) {
    lock(&STATE).queue.push(toast, now_ms());
    pump(&app);
}

/// Catches up a page that loaded after `toast-show` fired.
#[tauri::command]
pub fn toast_current() -> Option<Toast> {
    lock(&STATE).current.clone()
}

/// The page reports how tall the toast is, once drawn: it is placed and shown.
#[tauri::command]
pub fn toast_fit(app: AppHandle, height: f64) -> Result<(), String> {
    if lock(&STATE).current.is_none() || height < 1.0 {
        return Ok(());
    }
    let window = app.get_webview_window(LABEL).ok_or("toast window missing")?;
    let Some((monitor, dock, edge, scale)) = super::dock::resting() else { return Ok(()) };
    let size = ((TOAST_WIDTH * scale).round() as i32, (height * scale).round() as i32);
    let r = toast_rect(monitor, dock, edge, size, (MARGIN * scale).round() as i32);
    super::windows::put(&window, r).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())
}

/// The toast on screen is over: the next one, or the window goes, so a closed toast costs nothing.
#[tauri::command(async)]
pub fn toast_done(app: AppHandle) {
    lock(&STATE).current = None;
    pump(&app);
    if lock(&STATE).current.is_none() {
        if let Some(window) = app.get_webview_window(LABEL) {
            let _ = window.destroy();
        }
    }
}

/// Looks at held toasts again now and then, so they come out once quiet hours or a game end.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(RECHECK);
        let waiting = {
            let state = lock(&STATE);
            state.current.is_none() && !state.queue.is_empty()
        };
        if waiting {
            pump(&app);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::shell::dock::{Edge, Rect};

    fn toast(id: &str, title: &str) -> Toast {
        Toast { id: id.into(), title: title.into(), body: String::new(), action: None, sound: false, expires_at: None }
    }

    const OPEN: Gate = Gate { quiet: false, fullscreen: false, locked: false };

    #[test]
    fn quiet_hours_wrap_past_midnight() {
        assert!(quiet(23 * 60, 22 * 60, 8 * 60));
        assert!(quiet(7 * 60 + 59, 22 * 60, 8 * 60));
        assert!(!quiet(8 * 60, 22 * 60, 8 * 60));
        assert!(!quiet(12 * 60, 22 * 60, 8 * 60));
    }

    #[test]
    fn a_daytime_range_is_quiet_inside_only() {
        assert!(quiet(13 * 60 + 30, 13 * 60, 14 * 60));
        assert!(!quiet(14 * 60, 13 * 60, 14 * 60));
        assert!(!quiet(12 * 60 + 59, 13 * 60, 14 * 60));
    }

    #[test]
    fn an_empty_range_is_never_quiet() {
        assert!(!quiet(600, 600, 600));
        assert!(!quiet(0, 600, 600));
    }

    #[test]
    fn toasts_come_out_in_order() {
        let mut t = Toasts::default();
        t.push(toast("a", "A"), 0);
        t.push(toast("b", "B"), 0);
        assert_eq!(t.next(OPEN, 1).map(|t| t.id), Some("a".into()));
        assert_eq!(t.next(OPEN, 1).map(|t| t.id), Some("b".into()));
        assert_eq!(t.next(OPEN, 1), None);
        assert!(t.is_empty());
    }

    #[test]
    fn a_newer_toast_replaces_the_one_waiting() {
        let mut t = Toasts::default();
        t.push(toast("x", "60%"), 0);
        t.push(toast("b", "B"), 0);
        t.push(toast("x", "80%"), 5);
        assert_eq!(t.next(OPEN, 6).map(|t| t.title), Some("80%".into()));
        assert_eq!(t.next(OPEN, 6).map(|t| t.id), Some("b".into()));
        assert_eq!(t.next(OPEN, 6), None);
    }

    #[test]
    fn a_toast_held_in_quiet_hours_comes_out_after() {
        let mut t = Toasts::default();
        t.push(toast("a", "A"), 0);
        assert_eq!(t.next(Gate { quiet: true, ..OPEN }, 1), None);
        assert!(!t.is_empty());
        assert_eq!(t.next(OPEN, 2).map(|t| t.id), Some("a".into()));
    }

    #[test]
    fn fullscreen_holds_toasts() {
        let mut t = Toasts::default();
        t.push(toast("a", "A"), 0);
        assert_eq!(t.next(Gate { fullscreen: true, ..OPEN }, 1), None);
        assert_eq!(t.next(Gate { locked: true, ..OPEN }, 1), None);
        assert_eq!(t.next(OPEN, 2).map(|t| t.id), Some("a".into()));
    }

    #[test]
    fn a_toast_held_too_long_is_dropped() {
        let mut t = Toasts::default();
        t.push(toast("a", "A"), 0);
        assert_eq!(t.next(OPEN, HOLD_MAX_MS + 1), None);
        assert!(t.is_empty());
    }

    const FHD: Rect = Rect { x: 0, y: 0, w: 1920, h: 1080 };

    #[test]
    fn a_toast_sits_above_a_bottom_dock_at_the_right() {
        let dock = Rect { x: 660, y: 1002, w: 600, h: 72 };
        assert_eq!(toast_rect(FHD, dock, Edge::Bottom, (340, 90), 12), Rect { x: 1568, y: 900, w: 340, h: 90 });
    }

    #[test]
    fn a_toast_sits_below_a_top_dock() {
        let dock = Rect { x: 660, y: 6, w: 600, h: 72 };
        assert_eq!(toast_rect(FHD, dock, Edge::Top, (340, 90), 12).y, 6 + 72 + 12);
    }

    #[test]
    fn a_toast_stays_on_a_second_screen() {
        let side = Rect { x: 1920, y: 0, w: 1920, h: 1080 };
        let dock = Rect { x: 2580, y: 1002, w: 600, h: 72 };
        assert_eq!(toast_rect(side, dock, Edge::Bottom, (340, 90), 12).x, 1920 + 1920 - 340 - 12);
    }

    #[test]
    fn a_toast_taller_than_the_room_stays_on_the_screen() {
        let dock = Rect { x: 660, y: 1002, w: 600, h: 72 };
        assert_eq!(toast_rect(FHD, dock, Edge::Bottom, (340, 2000), 12).y, 0);
    }

    #[test]
    fn an_expired_toast_is_dropped() {
        let mut t = Toasts::default();
        t.push(Toast { expires_at: Some(1_000), ..toast("a", "A") }, 0);
        assert_eq!(t.next(OPEN, 999).map(|t| t.id), Some("a".into()));
        t.push(Toast { expires_at: Some(1_000), ..toast("a", "A") }, 0);
        assert_eq!(t.next(OPEN, 1_001), None);
        assert!(t.is_empty());
    }
}
