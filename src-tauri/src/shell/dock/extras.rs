//! The extra docks of Displays › All screens: one on each screen besides the main dock's. They show
//! the same widgets. Dragging the dock, auto-hide and live glass stay with the main dock: the extras
//! stay up, and their glass styles use the solid look they have with Show in screenshots.

use super::*;
use std::collections::HashMap;
use std::ffi::c_void;

use tauri::{WebviewUrl, WebviewWindowBuilder};

use super::many::{self, MAIN};

#[derive(Clone)]
pub struct Extra {
    pub label: String,
    /// The id of its screen.
    pub display: String,
    pub hwnd: isize,
    pub monitor: Rect,
    pub scale: f64,
    /// As its page last reported, in logical px.
    pub width: f64,
    /// Hidden under a fullscreen app on its screen.
    pub hidden: bool,
    /// The monitor its edge was last reserved on, and the strip.
    pub reserved_on: Option<Strip>,
}

static EXTRAS: Mutex<Vec<Extra>> = Mutex::new(Vec::new());

/// Extras don't slide away with auto-hide, so they keep their edge: windows mustn't run under them.
fn extra_reserves(layout: DockLayout, scale: f64) -> Option<i32> {
    reserved_with(layout, scale, false)
}

/// Explorer may have lost every strip: each is set again next time.
pub fn forget_reserved() {
    for e in lock(&EXTRAS).iter_mut() {
        e.reserved_on = None;
    }
}

/// The screens with a dock on them: the main dock's, and each extra's.
pub fn docked_monitors(main: Rect) -> Vec<Rect> {
    let mut all = vec![main];
    all.extend(lock(&EXTRAS).iter().map(|e| e.monitor));
    all
}

pub fn monitor_of(label: &str) -> Option<(Rect, f64)> {
    lock(&EXTRAS).iter().find(|e| e.label == label).map(|e| (e.monitor, e.scale))
}

/// Opens and closes extra docks to match the screens and the Displays setting.
pub fn sync(app: &AppHandle) {
    let displays = lock(&DOCK.displays).clone();
    let mode = *lock(&DOCK.display_mode);
    let slots: Vec<(String, String)> = lock(&EXTRAS).iter().map(|e| (e.label.clone(), e.display.clone())).collect();
    let plan = many::plan_docks(&displays, mode, &slots);
    for label in &plan.close {
        close(app, label);
    }
    // A screen that stays may have moved, or changed scale.
    for e in lock(&EXTRAS).iter_mut() {
        if let Some(d) = displays.iter().find(|d| d.id == e.display) {
            (e.monitor, e.scale) = (d.rect, d.scale);
        }
    }
    for id in &plan.create {
        if let Some(display) = displays.iter().find(|d| d.id == *id) {
            open(app, display);
        }
    }
    place_all(app);
}

/// Built off the main thread, as building a window on it deadlocks WebView2; subclassed on it, as
/// Windows only lets a window's own thread do that.
fn open(app: &AppHandle, display: &Display) {
    let label = {
        let mut used: Vec<String> = lock(&EXTRAS).iter().map(|e| e.label.clone()).collect();
        used.push(MAIN.to_string());
        many::free_label(&used)
    };
    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html?w=dock".into()))
        .title("Shelf")
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
        .inner_size(400.0, 72.0)
        .additional_browser_args(crate::shell::windows::BROWSER_ARGS)
        .build();
    let window = match built {
        Ok(window) => window,
        Err(e) => {
            crate::diag::note(&format!("an extra dock could not open: {e}"));
            return;
        }
    };
    let Ok(hwnd) = window.hwnd() else { return };
    let raw = hwnd.0 as isize;
    lock(&EXTRAS).push(Extra {
        label,
        display: display.id.clone(),
        hwnd: raw,
        monitor: display.rect,
        scale: display.scale,
        width: layout().width,
        hidden: false,
        reserved_on: None,
    });
    let _ = app.run_on_main_thread(move || unsafe {
        let h = HWND(raw as *mut c_void);
        // Clicking it mustn't take focus from your app, as with the main dock.
        let style = GetWindowLongPtrW(h, GWL_EXSTYLE);
        SetWindowLongPtrW(h, GWL_EXSTYLE, style | WS_EX_NOACTIVATE.0 as isize);
        let _ = SetWindowSubclass(h, Some(on_message), 1, 0);
    });
    let _ = crate::apps::previews::stay_during_peek(&window);
    let _ = window.show();
}

fn close(app: &AppHandle, label: &str) {
    let gone = {
        let mut extras = lock(&EXTRAS);
        extras.iter().position(|e| e.label == label).map(|i| extras.remove(i))
    };
    if let Some(e) = gone {
        appbar::unregister(e.hwnd);
    }
    // Not close(): docks refuse it, so Alt+F4 can't take one down.
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.destroy();
    }
}

fn place(app: &AppHandle, e: &Extra) -> Option<Strip> {
    let window = app.get_webview_window(&e.label)?;
    let l = DockLayout { width: e.width, ..layout() };
    let _ = crate::shell::windows::put(&window, resting_on(e.monitor, e.scale, l));
    if !crate::preview::current().reserve_edge {
        return None;
    }
    match extra_reserves(l, e.scale) {
        Some(h) => {
            let strip = (e.monitor, reserved_rect(e.monitor, h, l.edge));
            if !reserve_again(e.reserved_on, strip) {
                return e.reserved_on;
            }
            if e.reserved_on.is_some_and(|(was, _)| was != e.monitor) {
                appbar::unregister(e.hwnd);
            }
            appbar::register(e.hwnd, strip.1, l.edge);
            Some(strip)
        }
        None => {
            appbar::unregister(e.hwnd);
            None
        }
    }
}

fn place_one(app: &AppHandle, label: &str) {
    let Some(e) = lock(&EXTRAS).iter().find(|e| e.label == label).cloned() else { return };
    let reserved = place(app, &e);
    if let Some(stored) = lock(&EXTRAS).iter_mut().find(|x| x.label == label) {
        stored.reserved_on = reserved;
    }
}

pub fn place_all(app: &AppHandle) {
    let labels: Vec<String> = lock(&EXTRAS).iter().map(|e| e.label.clone()).collect();
    for label in labels {
        place_one(app, &label);
    }
    if let Some((main, _)) = monitor() {
        TASKBAR.set_docked(docked_monitors(main));
    }
}

/// An extra dock's page reported its width.
pub fn set_width(app: &AppHandle, label: &str, width: f64) {
    if let Some(e) = lock(&EXTRAS).iter_mut().find(|e| e.label == label) {
        e.width = width;
    }
    place_one(app, label);
}

/// Each extra hides under a fullscreen app on its own screen, and comes back after.
pub fn tick(app: &AppHandle, trackers: &mut HashMap<String, events::FullscreenTracker>) {
    let extras: Vec<(String, isize, bool)> = lock(&EXTRAS).iter().map(|e| (e.label.clone(), e.hwnd, e.hidden)).collect();
    trackers.retain(|label, _| extras.iter().any(|(l, _, _)| l == label));
    for (label, hwnd, hidden) in extras {
        let fullscreen = trackers.entry(label.clone()).or_default().sample(hwnd);
        if fullscreen == hidden {
            continue;
        }
        if let Some(window) = app.get_webview_window(&label) {
            let _ = if fullscreen { window.hide() } else { window.show() };
        }
        if let Some(e) = lock(&EXTRAS).iter_mut().find(|e| e.label == label) {
            e.hidden = fullscreen;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_extra_dock_keeps_its_edge_with_auto_hide_on() {
        let docked = DockLayout { float: false, ..FIRST_LAYOUT };
        assert!(extra_reserves(docked, 1.0).is_some());
        assert!(extra_reserves(FIRST_LAYOUT, 1.0).is_none(), "floating still reserves nothing");
    }
}
