//! Win+T walks the dock's open apps (F-054). The keyboard hook only reports keys; what each one
//! does, and which are kept from the app in front, is decided here, with no Windows involved.
//! Nothing is recorded: outside Win+T and the few keys that steer it, every key passes untouched.

use crate::util::lock;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{LazyLock, Mutex, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    VIRTUAL_KEY, VK_DOWN, VK_ESCAPE, VK_LEFT, VK_LSHIFT, VK_LWIN, VK_RETURN, VK_RIGHT, VK_RSHIFT, VK_RWIN, VK_SHIFT, VK_TAB, VK_UP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_INJECTED, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
};

use super::events;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Key {
    Win,
    T,
    Left,
    Right,
    Up,
    Down,
    Tab,
    Enter,
    Escape,
    Shift,
    Other,
}

#[derive(Clone, Copy, PartialEq, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum NavEvent {
    Start,
    Move { step: i32 },
    Window { step: i32 },
    Activate,
    Cancel,
}

#[derive(Default, PartialEq, Debug)]
pub struct Verdict {
    /// Kept from Windows and the app in front.
    pub swallow: bool,
    pub event: Option<NavEvent>,
    /// Windows opens Start when Win is let go with nothing else pressed. Having swallowed the T, a
    /// key nobody uses goes in first, so it doesn't.
    pub mask: bool,
}

#[derive(Default)]
pub struct KeyNav {
    navigating: bool,
    win: bool,
    shift: bool,
    /// A T was swallowed since Win went down.
    t_since_win: bool,
    /// Keys whose press was swallowed, so their release is too.
    held: Vec<Key>,
}

impl KeyNav {
    pub fn navigating(&self) -> bool {
        self.navigating
    }

    pub fn on_key(&mut self, key: Key, down: bool, dock_on: bool) -> Verdict {
        if down {
            self.press(key, dock_on)
        } else {
            self.release(key)
        }
    }

    /// Ends navigation from outside: a click elsewhere, a game, a locked screen.
    pub fn cancel(&mut self) -> Option<NavEvent> {
        std::mem::take(&mut self.navigating).then_some(NavEvent::Cancel)
    }

    fn press(&mut self, key: Key, dock_on: bool) -> Verdict {
        let back = if self.shift { -1 } else { 1 };
        let event = match key {
            Key::Win => {
                // Held, Windows repeats the press: only a fresh one starts afresh.
                if !self.win {
                    self.t_since_win = false;
                }
                self.win = true;
                return Verdict::default();
            }
            Key::Shift => {
                self.shift = true;
                return Verdict::default();
            }
            Key::T if self.win && dock_on => {
                self.t_since_win = true;
                if std::mem::replace(&mut self.navigating, true) {
                    NavEvent::Move { step: back }
                } else {
                    NavEvent::Start
                }
            }
            _ if !self.navigating => return Verdict::default(),
            Key::Left | Key::Up => NavEvent::Move { step: -1 },
            Key::Right | Key::Down => NavEvent::Move { step: 1 },
            Key::Tab => NavEvent::Window { step: back },
            Key::Enter => {
                self.navigating = false;
                NavEvent::Activate
            }
            Key::Escape => {
                self.navigating = false;
                NavEvent::Cancel
            }
            // Anything else ends it and reaches the app: typing goes where it was going.
            _ => {
                self.navigating = false;
                return Verdict { event: Some(NavEvent::Cancel), ..Verdict::default() };
            }
        };
        if !self.held.contains(&key) {
            self.held.push(key);
        }
        Verdict { swallow: true, event: Some(event), mask: false }
    }

    fn release(&mut self, key: Key) -> Verdict {
        let swallow = self.held.iter().position(|k| *k == key).map(|i| self.held.remove(i)).is_some();
        match key {
            Key::Shift => self.shift = false,
            Key::Win => {
                self.win = false;
                if std::mem::take(&mut self.t_since_win) {
                    return Verdict { mask: true, ..Verdict::default() };
                }
                // Win alone opens Start, which takes over from the dock.
                return Verdict { event: self.cancel(), ..Verdict::default() };
            }
            _ => {}
        }
        Verdict { swallow, ..Verdict::default() }
    }
}

static NAV: LazyLock<Mutex<KeyNav>> = LazyLock::new(|| Mutex::new(KeyNav::default()));
/// A copy of whether it's navigating, read without the lock by the dock's other threads.
static NAVIGATING: AtomicBool = AtomicBool::new(false);
static EVENTS: OnceLock<Sender<NavEvent>> = OnceLock::new();
/// No key has this code: pressed before Win is let go, it stops Windows opening Start.
const MASK: VIRTUAL_KEY = VIRTUAL_KEY(0xE8);

fn key_of(vk: u32) -> Key {
    match VIRTUAL_KEY(vk as u16) {
        VK_LWIN | VK_RWIN => Key::Win,
        VK_SHIFT | VK_LSHIFT | VK_RSHIFT => Key::Shift,
        VK_LEFT => Key::Left,
        VK_RIGHT => Key::Right,
        VK_UP => Key::Up,
        VK_DOWN => Key::Down,
        VK_TAB => Key::Tab,
        VK_RETURN => Key::Enter,
        VK_ESCAPE => Key::Escape,
        VIRTUAL_KEY(0x54) => Key::T,
        _ => Key::Other,
    }
}

/// Windows drops a hook that's slow to answer, so this only decides and hands any news to another thread.
unsafe extern "system" fn on_key(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        // Keys Shelf sends itself, as for Start's quick menu, are none of this.
        if (info.flags & LLKHF_INJECTED).0 == 0 {
            let down = matches!(wparam.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN);
            let dock_on = !events::FULLSCREEN.load(Ordering::Relaxed) && !events::LOCKED.load(Ordering::Relaxed);
            let verdict = {
                let mut nav = lock(&NAV);
                let verdict = nav.on_key(key_of(info.vkCode), down, dock_on);
                NAVIGATING.store(nav.navigating(), Ordering::Relaxed);
                verdict
            };
            if let (Some(event), Some(tx)) = (verdict.event, EVENTS.get()) {
                let _ = tx.send(event);
            }
            if verdict.mask {
                crate::system::tap_keys(&[MASK]);
            }
            if verdict.swallow {
                return LRESULT(1);
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

/// Starts watching for Win+T, except in the preview build.
pub fn start(app: &AppHandle) {
    if !crate::preview::current().hook_keys {
        return;
    }
    let (tx, rx) = channel::<NavEvent>();
    if EVENTS.set(tx).is_err() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        for event in rx {
            let _ = app.emit_to("dock", "keynav", event);
        }
    });
    std::thread::spawn(|| unsafe {
        let module = GetModuleHandleW(None).ok();
        if SetWindowsHookExW(WH_KEYBOARD_LL, Some(on_key), module.map(Into::into), 0).is_err() {
            crate::diag::note("the keyboard hook for Win+T could not be installed");
            return;
        }
        // A low-level hook is called through this thread's message loop.
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {}
    });
}

pub fn navigating() -> bool {
    NAVIGATING.load(Ordering::Relaxed)
}

/// Navigation ends from outside: a click elsewhere, a game, a locked screen.
pub fn cancel() {
    let event = lock(&NAV).cancel();
    NAVIGATING.store(false, Ordering::Relaxed);
    if let (Some(event), Some(tx)) = (event, EVENTS.get()) {
        let _ = tx.send(event);
    }
}

/// The page has nothing to walk through, as when no app is open.
#[tauri::command]
pub fn keynav_end() {
    lock(&NAV).cancel();
    NAVIGATING.store(false, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Presses and releases `key`, giving what the press did.
    fn tap(nav: &mut KeyNav, key: Key) -> Verdict {
        let pressed = nav.on_key(key, true, true);
        nav.on_key(key, false, true);
        pressed
    }

    /// Win+T, with Win still held.
    fn win_t(nav: &mut KeyNav) -> Verdict {
        nav.on_key(Key::Win, true, true);
        tap(nav, Key::T)
    }

    fn event(verdict: Verdict) -> Option<NavEvent> {
        verdict.event
    }

    #[test]
    fn win_t_starts_navigating_and_is_swallowed() {
        let mut nav = KeyNav::default();
        let v = win_t(&mut nav);
        assert!(v.swallow);
        assert_eq!(v.event, Some(NavEvent::Start));
        assert!(nav.navigating());
    }

    #[test]
    fn win_t_again_moves_to_the_next_app() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        assert_eq!(event(tap(&mut nav, Key::T)), Some(NavEvent::Move { step: 1 }));
        nav.on_key(Key::Shift, true, true);
        assert_eq!(event(tap(&mut nav, Key::T)), Some(NavEvent::Move { step: -1 }));
    }

    #[test]
    fn arrows_tab_enter_and_escape_steer_while_navigating() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, false, true);
        for (key, wanted) in [
            (Key::Left, NavEvent::Move { step: -1 }),
            (Key::Up, NavEvent::Move { step: -1 }),
            (Key::Right, NavEvent::Move { step: 1 }),
            (Key::Down, NavEvent::Move { step: 1 }),
            (Key::Tab, NavEvent::Window { step: 1 }),
        ] {
            let v = tap(&mut nav, key);
            assert!(v.swallow, "{key:?}");
            assert_eq!(v.event, Some(wanted), "{key:?}");
        }
        nav.on_key(Key::Shift, true, true);
        assert_eq!(event(tap(&mut nav, Key::Tab)), Some(NavEvent::Window { step: -1 }));
        nav.on_key(Key::Shift, false, true);
        let v = tap(&mut nav, Key::Escape);
        assert!(v.swallow);
        assert_eq!(v.event, Some(NavEvent::Cancel));
        assert!(!nav.navigating());
    }

    #[test]
    fn arrows_pass_through_when_not_navigating() {
        let mut nav = KeyNav::default();
        assert_eq!(tap(&mut nav, Key::Left), Verdict::default());
        assert_eq!(tap(&mut nav, Key::Enter), Verdict::default());
    }

    #[test]
    fn win_t_passes_through_when_the_dock_is_off() {
        let mut nav = KeyNav::default();
        nav.on_key(Key::Win, true, false);
        assert_eq!(nav.on_key(Key::T, true, false), Verdict::default());
        assert!(!nav.navigating());
    }

    #[test]
    fn another_key_cancels_and_reaches_the_app() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, false, true);
        let v = tap(&mut nav, Key::Other);
        assert!(!v.swallow);
        assert_eq!(v.event, Some(NavEvent::Cancel));
    }

    #[test]
    fn after_a_cancel_arrows_pass_through() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, false, true);
        assert_eq!(nav.cancel(), Some(NavEvent::Cancel));
        assert_eq!(nav.cancel(), None, "only once");
        assert!(!tap(&mut nav, Key::Left).swallow);
    }

    #[test]
    fn releasing_win_after_win_t_is_masked_once() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, true, true); // Win held: Windows repeats its press
        assert!(nav.on_key(Key::Win, false, true).mask);
        nav.on_key(Key::Win, true, true);
        assert!(!nav.on_key(Key::Win, false, true).mask);
    }

    #[test]
    fn enter_ends_navigation() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, false, true);
        assert_eq!(event(tap(&mut nav, Key::Enter)), Some(NavEvent::Activate));
        assert!(!nav.navigating());
    }

    #[test]
    fn opening_start_cancels_navigation() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, false, true);
        nav.on_key(Key::Win, true, true);
        let v = nav.on_key(Key::Win, false, true);
        assert_eq!(v, Verdict { swallow: false, event: Some(NavEvent::Cancel), mask: false });
        assert!(!nav.navigating());
    }

    #[test]
    fn the_release_of_a_swallowed_key_is_swallowed_too() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, false, true);
        assert_eq!(nav.on_key(Key::Enter, true, true).event, Some(NavEvent::Activate));
        assert!(nav.on_key(Key::Enter, false, true).swallow, "Enter's release stays with the dock");
        assert!(!nav.on_key(Key::Left, false, true).swallow, "a release whose press passed, passes");
    }
}
