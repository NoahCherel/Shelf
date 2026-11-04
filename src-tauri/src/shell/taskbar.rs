//! Hides the Windows taskbar and guarantees it comes back. The original setting
//! is saved to a file first, so it can be restored even after a crash.

use std::mem::size_of;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
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

pub trait TaskbarApi {
    fn autohide(&self) -> bool;
    fn set_autohide(&self, on: bool);
    fn hide_windows(&self);
    fn show_windows(&self);
}

pub struct Taskbar<A> {
    api: A,
    state_file: PathBuf,
    mode: Mutex<Mode>,
}

impl<A: TaskbarApi> Taskbar<A> {
    pub fn new(api: A, state_file: PathBuf) -> Self {
        Self { api, state_file, mode: Mutex::new(Mode::Off) }
    }

    pub fn mode(&self) -> Mode {
        *self.mode.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn apply(&self, next: Mode) {
        let mut mode = self.mode.lock().unwrap_or_else(|e| e.into_inner());
        // An existing file means a crashed run; what it holds is the real original.
        if !self.state_file.exists() {
            if let Some(dir) = self.state_file.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            let _ = std::fs::write(&self.state_file, if self.api.autohide() { "1" } else { "0" });
        }
        if !self.api.autohide() {
            self.api.set_autohide(true);
        }
        *mode = next;
        match next {
            Mode::Hidden => self.api.hide_windows(),
            _ => self.api.show_windows(),
        }
    }

    /// Explorer shows the taskbar again after an auto-hide change or its own
    /// restart, so this is called periodically rather than hiding it just once.
    pub fn keep(&self) {
        let mode = self.mode.lock().unwrap_or_else(|e| e.into_inner());
        if *mode == Mode::Hidden {
            self.api.hide_windows();
        }
    }

    pub fn restore(&self) {
        // Held until the end so keep() can't undo this mid-restore.
        let mut mode = self.mode.lock().unwrap_or_else(|e| e.into_inner());
        *mode = Mode::Off;
        // No state file means there is nothing to undo (e.g. a second restore after
        // the panic hook ran); don't guess and overwrite the user's auto-hide setting.
        if let Ok(saved) = std::fs::read_to_string(&self.state_file) {
            self.api.set_autohide(saved.trim() == "1");
        }
        self.api.show_windows();
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

    fn hide_windows(&self) {
        for h in taskbars() {
            unsafe {
                if IsWindowVisible(h).as_bool() {
                    let _ = ShowWindow(h, SW_HIDE);
                }
            }
        }
    }

    fn show_windows(&self) {
        for h in taskbars() {
            unsafe {
                let _ = ShowWindow(h, SW_SHOW);
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
    match mode.as_str() {
        "hidden" => TASKBAR.apply(Mode::Hidden),
        "autohide" => TASKBAR.apply(Mode::Autohide),
        _ => return Err(format!("unknown taskbar mode: {mode}")),
    }
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    /// Records calls and never touches the real taskbar.
    #[derive(Clone, Default)]
    pub struct Fake {
        pub autohide: Rc<RefCell<bool>>,
        pub calls: Rc<RefCell<Vec<String>>>,
    }

    impl TaskbarApi for Fake {
        fn autohide(&self) -> bool {
            *self.autohide.borrow()
        }
        fn set_autohide(&self, on: bool) {
            *self.autohide.borrow_mut() = on;
            self.calls.borrow_mut().push(format!("set_autohide({on})"));
        }
        fn hide_windows(&self) {
            self.calls.borrow_mut().push("hide".into());
        }
        fn show_windows(&self) {
            self.calls.borrow_mut().push("show".into());
        }
    }

    pub fn state_path(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("shelf-taskbar-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("taskbar_state.txt")
    }

    #[test]
    fn hide_saves_the_original_setting_then_restore_puts_it_back() {
        let fake = Fake::default();
        let bar = Taskbar::new(fake.clone(), state_path("restore"));
        bar.apply(Mode::Hidden);
        assert!(fake.autohide());
        bar.restore();
        assert!(!fake.autohide());
        assert!(fake.calls.borrow().contains(&"show".to_string()));
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
        let bar = Taskbar::new(fake.clone(), state_path("keep"));
        bar.keep();
        assert!(fake.calls.borrow().is_empty(), "does nothing before apply");
        bar.apply(Mode::Autohide);
        fake.calls.borrow_mut().clear();
        bar.keep();
        assert!(!fake.calls.borrow().contains(&"hide".to_string()));
        bar.apply(Mode::Hidden);
        fake.calls.borrow_mut().clear();
        bar.keep();
        assert_eq!(*fake.calls.borrow(), vec!["hide"]);
    }

    #[test]
    fn switching_to_autohide_shows_the_taskbar_again() {
        let fake = Fake::default();
        let bar = Taskbar::new(fake.clone(), state_path("switch"));
        bar.apply(Mode::Hidden);
        fake.calls.borrow_mut().clear();
        bar.apply(Mode::Autohide);
        assert!(fake.calls.borrow().contains(&"show".to_string()));
        assert!(fake.autohide());
    }
}
