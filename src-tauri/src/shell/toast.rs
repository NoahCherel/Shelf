//! Toasts: short notices above the dock, from any page (F-073). They wait out quiet hours, a
//! fullscreen game and a locked screen, then show one at a time.

use std::collections::VecDeque;

use serde::{Deserialize, Serialize};

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

#[cfg(test)]
mod tests {
    use super::*;

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
