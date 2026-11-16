//! Hides the Windows taskbar and guarantees it comes back. The original setting
//! is saved to a file first, so it can be restored even after a crash.

use crate::util::lock;

use super::dock::Rect;
use std::mem::size_of;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
use windows::Win32::System::Threading::{OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE};
use windows::Win32::UI::Shell::{SHAppBarMessage, ABM_GETSTATE, ABM_SETSTATE, ABS_ALWAYSONTOP, ABS_AUTOHIDE, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, FindWindowW, IsWindowVisible, ShowWindow, SW_HIDE, SW_SHOW,
};

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Mode {
    Off,
    Hidden,
    Autohide,
}

/// One of Windows' taskbars, and the monitor it's on.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Bar {
    pub id: isize,
    pub monitor: Rect,
}

pub trait TaskbarApi {
    fn autohide(&self) -> bool;
    fn set_autohide(&self, on: bool);
    fn bars(&self) -> Vec<Bar>;
    fn set_shown(&self, id: isize, shown: bool);
}

/// Hidden takes the taskbar away only from screens with a dock. Elsewhere it stays, and as Windows'
/// auto-hide setting is the same for every screen, it slides away there by itself.
pub fn shown(mode: Mode, bar_monitor: Rect, docked: &[Rect]) -> bool {
    mode != Mode::Hidden || !docked.contains(&bar_monitor)
}

/// A panic on the main thread ends Shelf. One on any other thread only ends that command, and
/// Shelf carries on with the taskbar still its to manage.
pub fn panic_ends_shelf(thread: Option<&str>) -> bool {
    thread == Some("main")
}

pub struct Taskbar<A> {
    api: A,
    state_file: PathBuf,
    mode: Mutex<Mode>,
    /// The monitors with a dock on them.
    docked: Mutex<Vec<Rect>>,
}

impl<A: TaskbarApi> Taskbar<A> {
    pub fn new(api: A, state_file: PathBuf) -> Self {
        Self { api, state_file, mode: Mutex::new(Mode::Off), docked: Mutex::new(Vec::new()) }
    }

    pub fn mode(&self) -> Mode {
        *lock(&self.mode)
    }

    pub fn apply(&self, next: Mode) {
        let mut mode = lock(&self.mode);
        // An existing file means a crashed run; what it holds is the real original.
        if !self.state_file.exists() {
            if let Some(dir) = self.state_file.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            // Without this file a crash couldn't bring the taskbar back, so it isn't hidden at all.
            if std::fs::write(&self.state_file, if self.api.autohide() { "1" } else { "0" }).is_err() {
                return;
            }
        }
        if !self.api.autohide() {
            self.api.set_autohide(true);
        }
        *mode = next;
        self.show_as(next);
    }

    fn show_as(&self, mode: Mode) {
        let docked = lock(&self.docked).clone();
        for bar in self.api.bars() {
            self.api.set_shown(bar.id, shown(mode, bar.monitor, &docked));
        }
    }

    /// The dock moved to other monitors, or the monitors changed.
    pub fn set_docked(&self, monitors: Vec<Rect>) {
        {
            let mut docked = lock(&self.docked);
            // Called at every placement: showing or hiding Windows' taskbar each time would make it flicker.
            if *docked == monitors {
                return;
            }
            *docked = monitors;
        }
        let mode = *lock(&self.mode);
        if mode != Mode::Off {
            self.show_as(mode);
        }
    }

    /// Explorer shows the taskbar again after an auto-hide change or its own
    /// restart, so this is called periodically rather than hiding it just once.
    pub fn keep(&self) {
        let mode = lock(&self.mode);
        if *mode == Mode::Hidden {
            let docked = lock(&self.docked).clone();
            for bar in self.api.bars() {
                if !shown(Mode::Hidden, bar.monitor, &docked) {
                    self.api.set_shown(bar.id, false);
                }
            }
        }
    }

    pub fn restore(&self) {
        // Held until the end so keep() can't undo this mid-restore.
        let mut mode = lock(&self.mode);
        *mode = Mode::Off;
        // No state file means there is nothing to undo (e.g. a second restore after
        // the panic hook ran); don't guess and overwrite the user's auto-hide setting.
        if let Ok(saved) = std::fs::read_to_string(&self.state_file) {
            self.api.set_autohide(saved.trim() == "1");
        }
        for bar in self.api.bars() {
            self.api.set_shown(bar.id, true);
        }
        let _ = std::fs::remove_file(&self.state_file);
    }
}

pub struct RealTaskbar;

fn tray() -> Option<HWND> {
    unsafe { FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) }.ok().filter(|h| !h.is_invalid())
}

fn taskbars() -> Vec<HWND> {
    let mut out: Vec<HWND> = tray().into_iter().collect();
    let mut after: Option<HWND> = None;
    while let Ok(h) = unsafe { FindWindowExW(None, after, w!("Shell_SecondaryTrayWnd"), PCWSTR::null()) } {
        if h.is_invalid() {
            break;
        }
        out.push(h);
        after = Some(h);
    }
    out
}

impl TaskbarApi for RealTaskbar {
    fn autohide(&self) -> bool {
        let Some(tray) = tray() else { return false };
        let mut abd = APPBARDATA { cbSize: size_of::<APPBARDATA>() as u32, hWnd: tray, ..Default::default() };
        (unsafe { SHAppBarMessage(ABM_GETSTATE, &mut abd) } as u32 & ABS_AUTOHIDE) != 0
    }

    fn set_autohide(&self, on: bool) {
        let Some(tray) = tray() else { return };
        let mut abd = APPBARDATA {
            cbSize: size_of::<APPBARDATA>() as u32,
            hWnd: tray,
            lParam: LPARAM(if on { ABS_AUTOHIDE } else { ABS_ALWAYSONTOP } as isize),
            ..Default::default()
        };
        unsafe { SHAppBarMessage(ABM_SETSTATE, &mut abd) };
    }

    fn bars(&self) -> Vec<Bar> {
        taskbars()
            .into_iter()
            .map(|h| {
                let mut info = MONITORINFO { cbSize: size_of::<MONITORINFO>() as u32, ..Default::default() };
                // A hidden taskbar still has its place, so its monitor is still known.
                let _ = unsafe { GetMonitorInfoW(MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), &mut info) };
                let r = info.rcMonitor;
                Bar { id: h.0 as isize, monitor: Rect { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top } }
            })
            .collect()
    }

    fn set_shown(&self, id: isize, shown: bool) {
        let h = HWND(id as *mut std::ffi::c_void);
        unsafe {
            if shown {
                let _ = ShowWindow(h, SW_SHOW);
            } else if IsWindowVisible(h).as_bool() {
                let _ = ShowWindow(h, SW_HIDE);
            }
        }
    }
}

pub static TASKBAR: LazyLock<Taskbar<RealTaskbar>> =
    LazyLock::new(|| Taskbar::new(RealTaskbar, crate::store::app_dir().join("taskbar_state.txt")));

/// Runs as a tiny companion process: when Shelf is killed outright, no panic hook
/// or exit handler runs, so this is what brings the taskbar back.
pub fn watch_parent(pid: u32) {
    unsafe {
        if let Ok(handle) = OpenProcess(PROCESS_SYNCHRONIZE, false, pid) {
            WaitForSingleObject(handle, INFINITE);
            let _ = CloseHandle(handle);
        }
    }
    if TASKBAR.state_file.exists() {
        TASKBAR.restore();
    }
}

#[tauri::command]
pub fn set_taskbar_mode(mode: String) -> Result<(), String> {
    crate::preview::guard()?;
    match mode.as_str() {
        "hidden" => super::dock::choose_taskbar_mode(Mode::Hidden),
        "autohide" => super::dock::choose_taskbar_mode(Mode::Autohide),
        _ => return Err(format!("unknown taskbar mode: {mode}")),
    }
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    pub const FHD: Rect = Rect { x: 0, y: 0, w: 1920, h: 1080 };
    const SIDE: Rect = Rect { x: 1920, y: 0, w: 1920, h: 1080 };

    /// Records calls and never touches the real taskbar. Has one taskbar, `1`, on `FHD`.
    #[derive(Clone)]
    pub struct Fake {
        pub autohide: Rc<RefCell<bool>>,
        pub calls: Rc<RefCell<Vec<String>>>,
        pub bars: Vec<Bar>,
    }

    impl Default for Fake {
        fn default() -> Self {
            Fake { autohide: Rc::default(), calls: Rc::default(), bars: vec![Bar { id: 1, monitor: FHD }] }
        }
    }

    impl TaskbarApi for Fake {
        fn autohide(&self) -> bool {
            *self.autohide.borrow()
        }
        fn set_autohide(&self, on: bool) {
            *self.autohide.borrow_mut() = on;
            self.calls.borrow_mut().push(format!("set_autohide({on})"));
        }
        fn bars(&self) -> Vec<Bar> {
            self.bars.clone()
        }
        fn set_shown(&self, id: isize, shown: bool) {
            let what = if shown { "show" } else { "hide" };
            self.calls.borrow_mut().push(format!("{what}:{id}"));
        }
    }

    /// A taskbar whose only screen, `FHD`, has the dock: the usual case.
    pub fn docked(fake: Fake, path: std::path::PathBuf) -> Taskbar<Fake> {
        let bar = Taskbar::new(fake, path);
        bar.set_docked(vec![FHD]);
        bar
    }

    fn two_screens() -> Fake {
        Fake { bars: vec![Bar { id: 1, monitor: FHD }, Bar { id: 2, monitor: SIDE }], ..Fake::default() }
    }

    fn has(fake: &Fake, call: &str) -> bool {
        fake.calls.borrow().iter().any(|c| c == call)
    }

    #[test]
    fn only_the_screen_with_the_dock_loses_its_taskbar() {
        let fake = two_screens();
        let bar = Taskbar::new(fake.clone(), state_path("per-screen"));
        bar.set_docked(vec![FHD]);
        bar.apply(Mode::Hidden);
        assert!(has(&fake, "hide:1") && has(&fake, "show:2"), "{:?}", fake.calls.borrow());
        assert!(fake.autohide(), "the screen without a dock keeps its taskbar on auto-hide");
    }

    #[test]
    fn a_screen_that_loses_the_dock_gets_its_taskbar_back() {
        let fake = two_screens();
        let bar = Taskbar::new(fake.clone(), state_path("moves"));
        bar.set_docked(vec![FHD]);
        bar.apply(Mode::Hidden);
        fake.calls.borrow_mut().clear();
        bar.set_docked(vec![SIDE]);
        assert!(has(&fake, "show:1") && has(&fake, "hide:2"), "{:?}", fake.calls.borrow());
    }

    #[test]
    fn autohide_mode_shows_every_taskbar() {
        let fake = two_screens();
        let bar = Taskbar::new(fake.clone(), state_path("autohide-all"));
        bar.set_docked(vec![FHD]);
        bar.apply(Mode::Autohide);
        assert!(has(&fake, "show:1") && has(&fake, "show:2"), "{:?}", fake.calls.borrow());
    }

    #[test]
    fn restore_shows_every_taskbar() {
        let fake = two_screens();
        let bar = Taskbar::new(fake.clone(), state_path("restore-all"));
        bar.set_docked(vec![FHD]);
        bar.apply(Mode::Hidden);
        fake.calls.borrow_mut().clear();
        bar.restore();
        assert!(has(&fake, "show:1") && has(&fake, "show:2"), "{:?}", fake.calls.borrow());
    }

    #[test]
    fn keep_rehides_only_the_docked_screen() {
        let fake = two_screens();
        let bar = Taskbar::new(fake.clone(), state_path("keep-docked"));
        bar.set_docked(vec![FHD]);
        bar.apply(Mode::Hidden);
        fake.calls.borrow_mut().clear();
        bar.keep();
        assert_eq!(*fake.calls.borrow(), vec!["hide:1"]);
    }

    #[test]
    fn the_same_screens_again_touch_nothing() {
        let fake = two_screens();
        let bar = Taskbar::new(fake.clone(), state_path("same"));
        bar.set_docked(vec![FHD]);
        bar.apply(Mode::Hidden);
        fake.calls.borrow_mut().clear();
        bar.set_docked(vec![FHD]);
        assert!(fake.calls.borrow().is_empty(), "{:?}", fake.calls.borrow());
    }

    pub fn state_path(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("shelf-taskbar-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("taskbar_state.txt")
    }

    #[test]
    fn it_wont_hide_the_taskbar_if_it_cant_save_how_to_bring_it_back() {
        let fake = Fake::default();
        let blocker = state_path("unwritable");
        std::fs::write(&blocker, "a file where a folder should be").unwrap();
        let bar = Taskbar::new(fake.clone(), blocker.join("taskbar_state.txt"));
        bar.apply(Mode::Hidden);
        assert!(fake.calls.borrow().is_empty(), "{:?}", fake.calls.borrow());
        assert_eq!(bar.mode(), Mode::Off);
    }

    #[test]
    fn only_a_panic_that_ends_shelf_brings_the_taskbar_back() {
        assert!(panic_ends_shelf(Some("main")));
        assert!(!panic_ends_shelf(Some("tokio-runtime-worker")));
        assert!(!panic_ends_shelf(None), "a command's own thread: Shelf carries on");
    }

    #[test]
    fn hide_saves_the_original_setting_then_restore_puts_it_back() {
        let fake = Fake::default();
        let bar = docked(fake.clone(), state_path("restore"));
        bar.apply(Mode::Hidden);
        assert!(fake.autohide());
        bar.restore();
        assert!(!fake.autohide());
        assert!(fake.calls.borrow().contains(&"show:1".to_string()));
    }

    #[test]
    fn second_restore_does_not_change_autohide() {
        let fake = Fake::default();
        let bar = Taskbar::new(fake.clone(), state_path("second"));
        bar.apply(Mode::Hidden);
        bar.restore();
        // The owner turns auto-hide on themselves; a later restore must leave it alone.
        *fake.autohide.borrow_mut() = true;
        fake.calls.borrow_mut().clear();
        bar.restore();
        assert!(fake.autohide());
        assert!(!fake.calls.borrow().iter().any(|c| c.starts_with("set_autohide")));
    }

    #[test]
    fn hide_does_not_overwrite_saved_state_after_a_crash() {
        let path = state_path("crash");
        std::fs::write(&path, "0").unwrap(); // left behind by a crashed run
        let fake = Fake::default();
        *fake.autohide.borrow_mut() = true; // the crashed run left auto-hide on
        let bar = Taskbar::new(fake.clone(), path);
        bar.apply(Mode::Hidden);
        bar.restore();
        assert!(!fake.autohide(), "the true original setting came back");
    }

    #[test]
    fn keep_rehides_only_in_hidden_mode() {
        let fake = Fake::default();
        let bar = docked(fake.clone(), state_path("keep"));
        bar.keep();
        assert!(fake.calls.borrow().is_empty(), "does nothing before apply");
        bar.apply(Mode::Autohide);
        fake.calls.borrow_mut().clear();
        bar.keep();
        assert!(!fake.calls.borrow().contains(&"hide:1".to_string()));
        bar.apply(Mode::Hidden);
        fake.calls.borrow_mut().clear();
        bar.keep();
        assert_eq!(*fake.calls.borrow(), vec!["hide:1"]);
    }

    #[test]
    fn switching_to_autohide_shows_the_taskbar_again() {
        let fake = Fake::default();
        let bar = docked(fake.clone(), state_path("switch"));
        bar.apply(Mode::Hidden);
        fake.calls.borrow_mut().clear();
        bar.apply(Mode::Autohide);
        assert!(fake.calls.borrow().contains(&"show:1".to_string()));
        assert!(fake.autohide());
    }
}
