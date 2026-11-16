//! Liquid Glass: decides when capture runs. Off under fullscreen, on lock, and for solid styles.

pub mod capture;

use crate::util::lock;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager};
use windows::Win32::Foundation::HWND;

use capture::Region;

pub trait Backend {
    fn begin(&mut self) -> Result<(), String>;
    fn end(&mut self);
}

pub struct Glass<B> {
    backend: B,
    wanted: bool,
    fullscreen: bool,
    locked: bool,
    /// Slid away: the page keeps its last frame for when it comes back.
    hidden: bool,
    running: bool,
}

impl<B: Backend> Glass<B> {
    pub fn new(backend: B) -> Self {
        Self { backend, wanted: false, fullscreen: false, locked: false, hidden: false, running: false }
    }

    fn settle(&mut self) -> Result<(), String> {
        let run = self.wanted && !self.fullscreen && !self.locked && !self.hidden;
        if run && !self.running {
            self.backend.begin()?;
            self.running = true;
        } else if !run && self.running {
            self.backend.end();
            self.running = false;
        }
        Ok(())
    }

    pub fn want(&mut self, on: bool) -> Result<(), String> {
        self.wanted = on;
        self.settle()
    }

    pub fn shell(&mut self, fullscreen: bool, locked: bool) {
        self.fullscreen = fullscreen;
        self.locked = locked;
        let _ = self.settle();
    }

    pub fn hidden(&mut self, hidden: bool) {
        self.hidden = hidden;
        let _ = self.settle();
    }

    /// A new session delivers a frame straight away, whether or not anything has moved.
    pub fn restart(&mut self) {
        if self.running {
            self.backend.end();
            self.running = false;
            let _ = self.settle();
        }
    }
}

struct RealCapture {
    app: AppHandle,
    session: Option<capture::Session>,
}

impl Backend for RealCapture {
    fn begin(&mut self) -> Result<(), String> {
        let dock = self.app.get_webview_window("dock").ok_or("dock window missing")?;
        let hwnd = dock.hwnd().map_err(|e| e.to_string())?;
        let app = self.app.clone();
        let notify = Box::new(move || {
            let _ = app.emit_to("dock", "glass-frame", ());
        });
        let session = capture::start(HWND(hwnd.0), notify).map_err(|e| e.to_string())?;
        self.session = Some(session);
        Ok(())
    }

    fn end(&mut self) {
        self.session = None;
    }
}

static GLASS: OnceLock<Mutex<Glass<RealCapture>>> = OnceLock::new();
/// Saves restarting for a window move that changes nothing.
static ACTIVE: AtomicBool = AtomicBool::new(false);

fn glass(app: &AppHandle) -> &'static Mutex<Glass<RealCapture>> {
    GLASS.get_or_init(|| Mutex::new(Glass::new(RealCapture { app: app.clone(), session: None })))
}

/// Live glass films the screen behind the main dock only; extra docks use their style's solid look.
fn has_glass(label: &str) -> bool {
    label == crate::shell::dock::many::MAIN
}

/// The page asks when its style is glass, and stops asking when it isn't.
#[tauri::command(async)]
pub fn glass_start(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    if !has_glass(window.label()) {
        return Err("no glass on this dock".into());
    }
    ACTIVE.store(true, Ordering::Relaxed);
    lock(glass(&app)).want(true)
}

#[tauri::command(async)]
pub fn glass_stop(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    if !has_glass(window.label()) {
        return Ok(());
    }
    ACTIVE.store(false, Ordering::Relaxed);
    lock(glass(&app)).want(false)
}

/// Collects the newest frame; empty when there's none waiting.
#[tauri::command]
pub fn glass_frame() -> Response {
    Response::new(capture::take_latest())
}

pub fn shell_changed(app: &AppHandle, fullscreen: bool, locked: bool) {
    lock(glass(app)).shell(fullscreen, locked);
}

pub fn dock_hidden(app: &AppHandle, hidden: bool) {
    lock(glass(app)).hidden(hidden);
}

/// Monitors changed or the PC woke: the old session may be stale.
pub fn restart(app: &AppHandle) {
    lock(glass(app)).restart();
}

/// The dock moved or changed size.
pub fn set_region(app: &AppHandle, region: Region) {
    if capture::set_region(region) && ACTIVE.load(Ordering::Relaxed) {
        let app = app.clone();
        // Off the main thread: starting a session waits on the graphics driver.
        std::thread::spawn(move || restart(&app));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_main_dock_films_the_screen() {
        assert!(has_glass("dock"));
        assert!(!has_glass("dock-2"));
    }

    #[derive(Default)]
    struct Fake {
        running: bool,
        starts: u32,
        fail: bool,
    }

    impl Backend for Fake {
        fn begin(&mut self) -> Result<(), String> {
            if self.fail {
                return Err("no capture here".into());
            }
            self.running = true;
            self.starts += 1;
            Ok(())
        }
        fn end(&mut self) {
            self.running = false;
        }
    }

    fn glass() -> Glass<Fake> {
        Glass::new(Fake::default())
    }

    #[test]
    fn starts_when_the_page_asks() {
        let mut g = glass();
        assert!(!g.backend.running);
        g.want(true).unwrap();
        assert!(g.backend.running);
    }

    #[test]
    fn capture_stops_under_fullscreen() {
        let mut g = glass();
        g.want(true).unwrap();
        g.shell(true, false);
        assert!(!g.backend.running);
        g.shell(false, false);
        assert!(g.backend.running, "comes back afterwards");
    }

    #[test]
    fn capture_stops_while_the_dock_is_hidden_and_resumes_after() {
        let mut g = glass();
        g.want(true).unwrap();
        g.hidden(true);
        assert!(!g.backend.running);
        g.hidden(false);
        assert!(g.backend.running);
        assert_eq!(g.backend.starts, 2);
    }

    #[test]
    fn capture_stops_on_lock() {
        let mut g = glass();
        g.want(true).unwrap();
        g.shell(false, true);
        assert!(!g.backend.running);
    }

    #[test]
    fn capture_stops_for_black() {
        let mut g = glass();
        g.want(true).unwrap();
        g.want(false).unwrap(); // the page drops it when the style isn't glass
        assert!(!g.backend.running);
    }

    #[test]
    fn stopping_twice_leaves_nothing_running() {
        let mut g = glass();
        g.want(true).unwrap();
        g.want(false).unwrap();
        g.want(false).unwrap();
        assert!(!g.backend.running);
        assert_eq!(g.backend.starts, 1);
    }

    #[test]
    fn asking_twice_starts_once() {
        let mut g = glass();
        g.want(true).unwrap();
        g.want(true).unwrap();
        assert_eq!(g.backend.starts, 1);
    }

    #[test]
    fn a_failed_start_is_reported_and_not_running() {
        let mut g = Glass::new(Fake { fail: true, ..Default::default() });
        assert!(g.want(true).is_err());
        assert!(!g.backend.running);
    }

    #[test]
    fn resizing_recreates_the_capture_surface() {
        let mut g = glass();
        g.want(true).unwrap();
        g.restart();
        assert_eq!(g.backend.starts, 2);
        assert!(g.backend.running);
    }

    #[test]
    fn restarting_while_stopped_does_not_start_it() {
        let mut g = glass();
        g.restart();
        assert_eq!(g.backend.starts, 0);
        g.want(true).unwrap();
        g.shell(true, false);
        g.restart();
        assert!(!g.backend.running);
    }
}
