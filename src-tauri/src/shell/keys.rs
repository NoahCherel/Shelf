//! Win+T walks the dock's open apps (F-054), and Win+A, Win+S and Win+N open Shelf's own panels.
//! The keyboard hook only reports keys; what each one does, and which are kept from the app in
//! front, is decided here, with no Windows involved. Nothing is recorded: outside those shortcuts
//! and the few keys that steer Win+T, every key passes untouched.

use crate::util::lock;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{LazyLock, Mutex, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    VIRTUAL_KEY, VK_CONTROL, VK_DOWN, VK_ESCAPE, VK_LCONTROL, VK_LEFT, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_MENU, VK_RCONTROL, VK_RETURN, VK_RIGHT,
    VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT, VK_TAB, VK_UP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_INJECTED, MSG, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
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
    Ctrl,
    Alt,
    A,
    S,
    N,
    Other,
}

/// Shelf's panels that Win and a letter open instead of Windows' own.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Panel {
    Quick,
    Search,
    Notifications,
}

impl Panel {
    /// What the dock is asked to open, as `open-request` names it.
    pub fn target(self) -> &'static str {
        match self {
            Panel::Quick => "panel:quick",
            Panel::Search => "panel:search",
            Panel::Notifications => "panel:notifications",
        }
    }

    fn of(key: Key) -> Option<Panel> {
        match key {
            Key::A => Some(Panel::Quick),
            Key::S => Some(Panel::Search),
            Key::N => Some(Panel::Notifications),
            _ => None,
        }
    }
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
    /// Win and a letter asked for one of Shelf's panels.
    pub panel: Option<Panel>,
}

#[derive(Default)]
pub struct KeyNav {
    navigating: bool,
    win: bool,
    shift: bool,
    ctrl: bool,
    alt: bool,
    /// A T, or a letter for a panel, was swallowed since Win went down.
    swallowed_since_win: bool,
    /// Keys whose press was swallowed, so their release is too.
    held: Vec<Key>,
}

impl KeyNav {
    pub fn navigating(&self) -> bool {
        self.navigating
    }

    /// `panels_on`: Win+A, Win+S and Win+N go to Shelf, as set in Settings.
    pub fn on_key(&mut self, key: Key, down: bool, dock_on: bool, panels_on: bool) -> Verdict {
        if down {
            self.press(key, dock_on, panels_on)
        } else {
            self.release(key)
        }
    }

    /// Forgets which keys are held, as when the session locks: Windows then lets them go where the
    /// hook can't see it, and a Win thought held would turn every T typed afterwards into Win+T.
    pub fn forget_held(&mut self) {
        self.win = false;
        self.shift = false;
        self.ctrl = false;
        self.alt = false;
        self.swallowed_since_win = false;
        self.held.clear();
    }

    /// Ends navigation from outside: a click elsewhere, a game, a locked screen.
    pub fn cancel(&mut self) -> Option<NavEvent> {
        std::mem::take(&mut self.navigating).then_some(NavEvent::Cancel)
    }

    fn press(&mut self, key: Key, dock_on: bool, panels_on: bool) -> Verdict {
        let back = if self.shift { -1 } else { 1 };
        // Only Win and the letter alone: Win+Shift+S is Windows' screenshot.
        let plain_win = self.win && !self.shift && !self.ctrl && !self.alt;
        let event = match key {
            Key::Win => {
                // Held, Windows repeats the press: only a fresh one starts afresh.
                if !self.win {
                    self.swallowed_since_win = false;
                }
                self.win = true;
                return Verdict::default();
            }
            Key::Shift => {
                self.shift = true;
                return Verdict::default();
            }
            Key::Ctrl | Key::Alt => {
                if key == Key::Ctrl {
                    self.ctrl = true;
                } else {
                    self.alt = true;
                }
                // As any other key, they end a walk and reach the app.
                return Verdict { event: self.cancel(), ..Verdict::default() };
            }
            Key::A | Key::S | Key::N if plain_win && dock_on && panels_on => {
                self.swallowed_since_win = true;
                if !self.held.contains(&key) {
                    self.held.push(key);
                }
                // A panel takes over from a Win+T walk.
                return Verdict { swallow: true, event: self.cancel(), mask: false, panel: Panel::of(key) };
            }
            Key::T if self.win && dock_on => {
                self.swallowed_since_win = true;
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
        Verdict { swallow: true, event: Some(event), mask: false, panel: None }
    }

    fn release(&mut self, key: Key) -> Verdict {
        let swallow = self.held.iter().position(|k| *k == key).map(|i| self.held.remove(i)).is_some();
        match key {
            Key::Shift => self.shift = false,
            Key::Ctrl => self.ctrl = false,
            Key::Alt => self.alt = false,
            Key::Win => {
                self.win = false;
                if std::mem::take(&mut self.swallowed_since_win) {
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
static EVENTS: OnceLock<Sender<Outgoing>> = OnceLock::new();
/// Win+A, Win+S and Win+N go to Shelf, as set in Settings.
static PANEL_KEYS: AtomicBool = AtomicBool::new(true);

/// What the hook hands the thread that talks to the dock.
enum Outgoing {
    Nav(NavEvent),
    Open(&'static str),
}
/// No key has this code: pressed before Win is let go, it stops Windows opening Start.
const MASK: VIRTUAL_KEY = VIRTUAL_KEY(0xE8);

/// Left alone this long, navigation ends: if the dock never answered, arrows go back to the apps.
pub const NAV_IDLE_MS: u64 = 8_000;

pub fn timed_out(last_ms: u64, now_ms: u64) -> bool {
    now_ms.saturating_sub(last_ms) >= NAV_IDLE_MS
}

/// A button pressed anywhere ends navigation, however short the press.
fn ends_navigation(msg: u32) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_RBUTTONDOWN, WM_XBUTTONDOWN};
    matches!(msg, WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN | WM_XBUTTONDOWN)
}

/// Win+T is the dock's only with nothing fullscreen, on the dock's screen or in front.
fn win_t_allowed(locked: bool, dock_fullscreen: bool, front_fullscreen: bool) -> bool {
    !(locked || dock_fullscreen || front_fullscreen)
}

static STARTED: LazyLock<std::time::Instant> = LazyLock::new(std::time::Instant::now);
/// When navigation last did something, in ms since Shelf started.
static LAST_NAV: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn now_ms() -> u64 {
    STARTED.elapsed().as_millis() as u64
}

/// Navigation that went quiet, as when the dock has no Apps widget to answer it.
pub fn idle_too_long() -> bool {
    timed_out(LAST_NAV.load(Ordering::Relaxed), now_ms())
}

fn win_physically_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    [VK_LWIN, VK_RWIN].into_iter().any(|k| unsafe { GetAsyncKeyState(k.0 as i32) } < 0)
}

fn key_of(vk: u32) -> Key {
    match VIRTUAL_KEY(vk as u16) {
        VK_LWIN | VK_RWIN => Key::Win,
        VK_SHIFT | VK_LSHIFT | VK_RSHIFT => Key::Shift,
        VK_CONTROL | VK_LCONTROL | VK_RCONTROL => Key::Ctrl,
        VK_MENU | VK_LMENU | VK_RMENU => Key::Alt,
        VIRTUAL_KEY(0x41) => Key::A,
        VIRTUAL_KEY(0x53) => Key::S,
        VIRTUAL_KEY(0x4E) => Key::N,
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
            let key = key_of(info.vkCode);
            // Only the letters of a shortcut need to know: the fullscreen check reads the window in
            // front, so it isn't made per key.
            let shortcut = matches!(key, Key::T | Key::A | Key::S | Key::N) && down;
            let dock_on = shortcut
                && win_t_allowed(events::LOCKED.load(Ordering::Relaxed), events::FULLSCREEN.load(Ordering::Relaxed), events::front_is_fullscreen());
            let verdict = {
                let mut nav = lock(&NAV);
                // A Win whose release went unseen, as when the session locked, isn't held any more.
                if shortcut && !win_physically_down() {
                    nav.forget_held();
                }
                let verdict = nav.on_key(key, down, dock_on, PANEL_KEYS.load(Ordering::Relaxed));
                NAVIGATING.store(nav.navigating(), Ordering::Relaxed);
                verdict
            };
            if let (Some(event), Some(tx)) = (verdict.event, EVENTS.get()) {
                LAST_NAV.store(now_ms(), Ordering::Relaxed);
                let _ = tx.send(Outgoing::Nav(event));
            }
            if let (Some(panel), Some(tx)) = (verdict.panel, EVENTS.get()) {
                let _ = tx.send(Outgoing::Open(panel.target()));
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

/// A click anywhere ends Win+T, however short: polling the buttons could miss a touchpad tap.
unsafe extern "system" fn on_mouse(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 && NAVIGATING.load(Ordering::Relaxed) && ends_navigation(wparam.0 as u32) {
        cancel();
    }
    CallNextHookEx(None, code, wparam, lparam)
}

/// Starts watching for Win+T, except in the preview build.
pub fn start(app: &AppHandle) {
    if !crate::preview::current().hook_keys {
        return;
    }
    PANEL_KEYS.store(super::dock::panel_keys(crate::store::load(crate::store::SETTINGS).as_ref()), Ordering::Relaxed);
    let (tx, rx) = channel::<Outgoing>();
    if EVENTS.set(tx).is_err() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        for out in rx {
            let _ = match out {
                Outgoing::Nav(event) => app.emit_to("dock", "keynav", event),
                Outgoing::Open(target) => app.emit_to("dock", "open-request", serde_json::json!({ "target": target })),
            };
        }
    });
    std::thread::spawn(|| unsafe {
        let module = GetModuleHandleW(None).ok();
        if SetWindowsHookExW(WH_KEYBOARD_LL, Some(on_key), module.map(Into::into), 0).is_err() {
            crate::diag::note("the keyboard hook for Win+T could not be installed");
            return;
        }
        // It only looks at an atomic until Win+T is on, so the pointer isn't slowed.
        if SetWindowsHookExW(WH_MOUSE_LL, Some(on_mouse), module.map(Into::into), 0).is_err() {
            crate::diag::note("the mouse hook that ends Win+T could not be installed");
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
        let _ = tx.send(Outgoing::Nav(event));
    }
}

/// The session locked: keys let go there never reach the hook.
pub fn forget_held() {
    lock(&NAV).forget_held();
}

/// Settings turned Win+A, Win+S and Win+N on or off.
#[tauri::command]
pub fn set_panel_keys(on: bool) {
    PANEL_KEYS.store(on, Ordering::Relaxed);
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

    #[test]
    fn locking_forgets_keys_held_when_it_happened() {
        let mut nav = KeyNav::default();
        nav.on_key(Key::Win, true, true, true); // Win+L: Win's release happens where the hook can't see it
        nav.forget_held();
        assert_eq!(nav.on_key(Key::T, true, true, true), Verdict::default(), "a plain t reaches the app");
    }

    #[test]
    fn any_mouse_button_ends_navigation() {
        use windows::Win32::UI::WindowsAndMessaging::{WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MOUSEMOVE, WM_RBUTTONDOWN, WM_XBUTTONDOWN};
        for msg in [WM_LBUTTONDOWN, WM_RBUTTONDOWN, WM_MBUTTONDOWN, WM_XBUTTONDOWN] {
            assert!(ends_navigation(msg), "{msg}");
        }
        assert!(!ends_navigation(WM_MOUSEMOVE) && !ends_navigation(WM_LBUTTONUP));
    }

    #[test]
    fn win_t_is_left_to_windows_over_any_fullscreen_app() {
        assert!(win_t_allowed(false, false, false));
        assert!(!win_t_allowed(true, false, false), "locked");
        assert!(!win_t_allowed(false, true, false), "a game over the dock");
        assert!(!win_t_allowed(false, false, true), "a game on another screen, in front");
    }

    #[test]
    fn navigation_left_alone_ends_by_itself() {
        assert!(!timed_out(1000, 1000 + NAV_IDLE_MS - 1));
        assert!(timed_out(1000, 1000 + NAV_IDLE_MS));
    }

    /// Presses and releases `key`, giving what the press did.
    fn tap(nav: &mut KeyNav, key: Key) -> Verdict {
        let pressed = nav.on_key(key, true, true, true);
        nav.on_key(key, false, true, true);
        pressed
    }

    /// Win+T, with Win still held.
    fn win_t(nav: &mut KeyNav) -> Verdict {
        nav.on_key(Key::Win, true, true, true);
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
        nav.on_key(Key::Shift, true, true, true);
        assert_eq!(event(tap(&mut nav, Key::T)), Some(NavEvent::Move { step: -1 }));
    }

    #[test]
    fn arrows_tab_enter_and_escape_steer_while_navigating() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, false, true, true);
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
        nav.on_key(Key::Shift, true, true, true);
        assert_eq!(event(tap(&mut nav, Key::Tab)), Some(NavEvent::Window { step: -1 }));
        nav.on_key(Key::Shift, false, true, true);
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
        nav.on_key(Key::Win, true, false, true);
        assert_eq!(nav.on_key(Key::T, true, false, true), Verdict::default());
        assert!(!nav.navigating());
    }

    #[test]
    fn another_key_cancels_and_reaches_the_app() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, false, true, true);
        let v = tap(&mut nav, Key::Other);
        assert!(!v.swallow);
        assert_eq!(v.event, Some(NavEvent::Cancel));
    }

    #[test]
    fn after_a_cancel_arrows_pass_through() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, false, true, true);
        assert_eq!(nav.cancel(), Some(NavEvent::Cancel));
        assert_eq!(nav.cancel(), None, "only once");
        assert!(!tap(&mut nav, Key::Left).swallow);
    }

    #[test]
    fn releasing_win_after_win_t_is_masked_once() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, true, true, true); // Win held: Windows repeats its press
        assert!(nav.on_key(Key::Win, false, true, true).mask);
        nav.on_key(Key::Win, true, true, true);
        assert!(!nav.on_key(Key::Win, false, true, true).mask);
    }

    #[test]
    fn enter_ends_navigation() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, false, true, true);
        assert_eq!(event(tap(&mut nav, Key::Enter)), Some(NavEvent::Activate));
        assert!(!nav.navigating());
    }

    #[test]
    fn opening_start_cancels_navigation() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, false, true, true);
        nav.on_key(Key::Win, true, true, true);
        let v = nav.on_key(Key::Win, false, true, true);
        assert_eq!(v, Verdict { swallow: false, event: Some(NavEvent::Cancel), mask: false, panel: None });
        assert!(!nav.navigating());
    }

    #[test]
    fn the_release_of_a_swallowed_key_is_swallowed_too() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        nav.on_key(Key::Win, false, true, true);
        assert_eq!(nav.on_key(Key::Enter, true, true, true).event, Some(NavEvent::Activate));
        assert!(nav.on_key(Key::Enter, false, true, true).swallow, "Enter's release stays with the dock");
        assert!(!nav.on_key(Key::Left, false, true, true).swallow, "a release whose press passed, passes");
    }

    /// Win and a letter, with Win still held, giving what the letter did.
    fn win_and(nav: &mut KeyNav, letter: Key, panels_on: bool, dock_on: bool) -> Verdict {
        nav.on_key(Key::Win, true, dock_on, panels_on);
        let pressed = nav.on_key(letter, true, dock_on, panels_on);
        nav.on_key(letter, false, dock_on, panels_on);
        pressed
    }

    #[test]
    fn win_a_s_n_open_shelf_s_panels() {
        for (letter, panel) in [(Key::A, Panel::Quick), (Key::S, Panel::Search), (Key::N, Panel::Notifications)] {
            let mut nav = KeyNav::default();
            let v = win_and(&mut nav, letter, true, true);
            assert!(v.swallow, "{letter:?}");
            assert_eq!(v.panel, Some(panel));
            assert!(!nav.navigating());
        }
        assert_eq!(Panel::Quick.target(), "panel:quick");
        assert_eq!(Panel::Search.target(), "panel:search");
        assert_eq!(Panel::Notifications.target(), "panel:notifications");
    }

    #[test]
    fn the_letter_s_release_is_swallowed_too() {
        let mut nav = KeyNav::default();
        nav.on_key(Key::Win, true, true, true);
        nav.on_key(Key::S, true, true, true);
        assert!(nav.on_key(Key::S, false, true, true).swallow);
    }

    #[test]
    fn releasing_win_after_win_a_is_masked() {
        let mut nav = KeyNav::default();
        win_and(&mut nav, Key::A, true, true);
        assert!(nav.on_key(Key::Win, false, true, true).mask);
    }

    #[test]
    fn win_a_passes_through_with_the_setting_off() {
        let mut nav = KeyNav::default();
        let v = win_and(&mut nav, Key::A, false, true);
        assert_eq!((v.swallow, v.panel), (false, None));
        assert!(!nav.on_key(Key::Win, false, true, false).mask);
    }

    #[test]
    fn win_a_passes_through_in_a_fullscreen_game() {
        let mut nav = KeyNav::default();
        let v = win_and(&mut nav, Key::A, true, false);
        assert_eq!((v.swallow, v.panel), (false, None));
        assert!(!nav.on_key(Key::Win, false, false, true).mask);
    }

    #[test]
    fn win_a_ends_win_t_navigation() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        let v = nav.on_key(Key::A, true, true, true);
        assert_eq!((v.swallow, v.event, v.panel), (true, Some(NavEvent::Cancel), Some(Panel::Quick)));
        assert!(!nav.navigating());
    }

    #[test]
    fn a_without_win_is_just_typing() {
        let mut nav = KeyNav::default();
        let v = tap(&mut nav, Key::A);
        assert_eq!((v.swallow, v.panel), (false, None));
    }

    #[test]
    fn win_shift_s_still_takes_a_screenshot() {
        let mut nav = KeyNav::default();
        nav.on_key(Key::Win, true, true, true);
        nav.on_key(Key::Shift, true, true, true);
        let v = nav.on_key(Key::S, true, true, true);
        assert_eq!((v.swallow, v.panel), (false, None));
        nav.on_key(Key::S, false, true, true);
        nav.on_key(Key::Shift, false, true, true);
        assert!(!nav.on_key(Key::Win, false, true, true).mask);
    }

    #[test]
    fn win_ctrl_or_alt_with_a_letter_is_left_to_windows() {
        for modifier in [Key::Ctrl, Key::Alt] {
            let mut nav = KeyNav::default();
            nav.on_key(Key::Win, true, true, true);
            nav.on_key(modifier, true, true, true);
            let v = nav.on_key(Key::N, true, true, true);
            assert_eq!((v.swallow, v.panel), (false, None), "{modifier:?}");
        }
    }

    #[test]
    fn alt_still_ends_win_t_navigation() {
        let mut nav = KeyNav::default();
        win_t(&mut nav);
        let v = nav.on_key(Key::Alt, true, true, true);
        assert_eq!((v.swallow, v.event), (false, Some(NavEvent::Cancel)));
    }

    #[test]
    fn locking_forgets_ctrl_and_alt_too() {
        let mut nav = KeyNav::default();
        nav.on_key(Key::Ctrl, true, true, true);
        nav.forget_held();
        let v = win_and(&mut nav, Key::A, true, true);
        assert_eq!(v.panel, Some(Panel::Quick));
    }
}
