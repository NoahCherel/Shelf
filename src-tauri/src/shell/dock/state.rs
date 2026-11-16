//! What the dock does about what the shell tells it: a pure state machine.

use super::super::autohide::{self, Slide};
use super::super::taskbar::Mode;

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
    /// Asks Windows for its screens again: they may have changed.
    ReadDisplays,
    /// Forgets what was reserved, so it's reserved again even if unchanged: Explorer may have lost it.
    ForgetAppbar,
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
        ShellEvent::TaskbarCreated => vec![ReadDisplays, KeepTaskbar, ForgetAppbar, RegisterAppbar, PlaceDock],
        ShellEvent::DisplayChange => vec![ReadDisplays, KeepTaskbar, RegisterAppbar, PlaceDock, RestartGlass],
        ShellEvent::Resume => {
            let mut actions = vec![ReadDisplays, KeepTaskbar, ForgetAppbar, RegisterAppbar, PlaceDock, RestartGlass];
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
            vec![ReadDisplays, KeepTaskbar, ForgetAppbar, RegisterAppbar, PlaceDock, RestartGlass, Announce]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explorer_restarting_reserves_the_edge_again() {
        for event in [ShellEvent::TaskbarCreated, ShellEvent::Resume, ShellEvent::Unlock] {
            let actions = react(event, &mut DockState { locked: true, ..Default::default() });
            let forget = actions.iter().position(|a| *a == Action::ForgetAppbar).unwrap_or(usize::MAX);
            let register = actions.iter().position(|a| *a == Action::RegisterAppbar).unwrap();
            assert!(forget < register, "{event:?}");
        }
        // A strip moving is news to the other docks: reserving again on it would answer in turn.
        assert!(!react(ShellEvent::DisplayChange, &mut DockState::default()).contains(&Action::ForgetAppbar));
    }
    use crate::shell::taskbar::tests::{docked, state_path, Fake};
    use crate::shell::taskbar::{Mode, TaskbarApi};

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
        let bar = docked(fake.clone(), state_path("created"));
        bar.apply(Mode::Hidden);
        fake.calls.borrow_mut().clear();

        let actions = react(ShellEvent::TaskbarCreated, &mut DockState::default());
        assert!(actions.contains(&Action::RegisterAppbar));
        assert!(actions.contains(&Action::PlaceDock));
        assert!(actions.contains(&Action::KeepTaskbar));

        bar.keep(); // what KeepTaskbar runs
        assert_eq!(*fake.calls.borrow(), vec!["hide:1"]);
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
    fn the_screens_are_reread_before_the_dock_is_placed() {
        for event in [ShellEvent::DisplayChange, ShellEvent::Resume, ShellEvent::Unlock, ShellEvent::TaskbarCreated] {
            let actions = react(event, &mut DockState { locked: true, ..Default::default() });
            assert_eq!(actions[0], Action::ReadDisplays, "{event:?}");
            let place = actions.iter().position(|a| *a == Action::PlaceDock).unwrap();
            assert!(place > 0, "{event:?}");
        }
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
