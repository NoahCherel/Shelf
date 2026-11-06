//! Auto-hide: when the dock slides away and when it comes back. `AutoHide::decide` and the
//! geometry are pure; `watch` samples the pointer and the shell, and does nothing while it's off.

use super::dock::{Edge, Rect};

/// How long nothing has to be holding the dock before it goes.
pub const HIDE_AFTER_MS: u64 = 400;
/// The slide itself, eased out (G-10).
pub const SLIDE_MS: u64 = 200;

/// What the shell looks like at one moment.
#[derive(Clone, Copy, Default, Debug)]
pub struct Seen {
    /// The pointer touches the dock's edge of the screen.
    pub at_edge: bool,
    pub on_dock: bool,
    /// Something of the dock's is in use: a card, menu, preview or the hidden icons, Start, the
    /// picker or Settings, or a drag.
    pub busy: bool,
    pub desktop: bool,
    pub fullscreen: bool,
    pub locked: bool,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Slide {
    In,
    Out,
}

#[derive(Default)]
pub struct AutoHide {
    pub hidden: bool,
    idle_since: Option<u64>,
}

impl AutoHide {
    pub fn decide(&mut self, seen: Seen, show_on_desktop: bool, now: u64) -> Option<Slide> {
        // A game or a locked screen never brings it back, whatever the pointer does.
        if seen.fullscreen || seen.locked {
            self.idle_since = None;
            return None;
        }
        let held = seen.busy || (show_on_desktop && seen.desktop);
        if self.hidden {
            if seen.at_edge || held {
                self.hidden = false;
                self.idle_since = None;
                return Some(Slide::In);
            }
            return None;
        }
        if held || seen.on_dock || seen.at_edge {
            self.idle_since = None;
            return None;
        }
        match self.idle_since {
            None => {
                self.idle_since = Some(now);
                None
            }
            Some(since) if now.saturating_sub(since) >= HIDE_AFTER_MS => {
                self.hidden = true;
                self.idle_since = None;
                Some(Slide::Out)
            }
            Some(_) => None,
        }
    }

    /// The option was turned off: a hidden dock comes back.
    pub fn reveal(&mut self) -> Option<Slide> {
        self.idle_since = None;
        std::mem::take(&mut self.hidden).then_some(Slide::In)
    }
}

/// The whole width of the monitor's edge counts, as with the taskbar.
pub fn at_edge(x: i32, y: i32, monitor: Rect, edge: Edge) -> bool {
    let across = x >= monitor.x && x < monitor.x + monitor.w;
    let line = match edge {
        Edge::Bottom => y >= monitor.y + monitor.h - 1,
        Edge::Top => y <= monitor.y,
    };
    across && line
}

/// The bar, and the gap between it and the edge, so leaving downward doesn't count as leaving.
pub fn on_dock(x: i32, y: i32, dock: Rect, monitor: Rect, edge: Edge) -> bool {
    let (top, bottom) = match edge {
        Edge::Bottom => (dock.y, monitor.y + monitor.h),
        Edge::Top => (monitor.y, dock.y + dock.h),
    };
    x >= dock.x && x < dock.x + dock.w && y >= top && y < bottom
}

/// Just past the edge, where nothing of it shows.
pub fn hidden_y(dock: Rect, monitor: Rect, edge: Edge) -> i32 {
    match edge {
        Edge::Bottom => monitor.y + monitor.h,
        Edge::Top => monitor.y - dock.h,
    }
}

/// Where the window is `progress` (0 to 1) of the way through a slide.
pub fn slide_y(dock: Rect, monitor: Rect, edge: Edge, slide: Slide, progress: f64) -> i32 {
    let eased = 1.0 - (1.0 - progress.clamp(0.0, 1.0)).powi(3);
    let (from, to) = match slide {
        Slide::Out => (dock.y, hidden_y(dock, monitor, edge)),
        Slide::In => (hidden_y(dock, monitor, edge), dock.y),
    };
    from + ((to - from) as f64 * eased).round() as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    const FHD: Rect = Rect { x: 0, y: 0, w: 1920, h: 1080 };
    const DOCK: Rect = Rect { x: 460, y: 1003, w: 1000, h: 69 };
    const TOP_DOCK: Rect = Rect { x: 460, y: 8, w: 1000, h: 69 };

    fn idle() -> Seen {
        Seen::default()
    }

    fn hidden_dock() -> AutoHide {
        let mut a = AutoHide::default();
        a.decide(idle(), false, 0);
        assert_eq!(a.decide(idle(), false, HIDE_AFTER_MS), Some(Slide::Out));
        a
    }

    #[test]
    fn it_leaves_only_after_a_moment_of_nothing() {
        let mut a = AutoHide::default();
        assert_eq!(a.decide(idle(), false, 0), None);
        assert_eq!(a.decide(idle(), false, HIDE_AFTER_MS - 1), None);
        assert_eq!(a.decide(idle(), false, HIDE_AFTER_MS), Some(Slide::Out));
        assert!(a.hidden);
        assert_eq!(a.decide(idle(), false, HIDE_AFTER_MS * 3), None, "once");
    }

    #[test]
    fn the_pointer_on_it_keeps_it_and_starts_the_wait_again() {
        let mut a = AutoHide::default();
        a.decide(idle(), false, 0);
        assert_eq!(a.decide(Seen { on_dock: true, ..idle() }, false, 300), None);
        assert_eq!(a.decide(idle(), false, 500), None, "the wait started over");
        assert_eq!(a.decide(idle(), false, 900), Some(Slide::Out));
    }

    #[test]
    fn anything_in_use_keeps_it() {
        let mut a = AutoHide::default();
        for t in [0, 1000, 5000] {
            assert_eq!(a.decide(Seen { busy: true, ..idle() }, false, t), None);
        }
        assert!(!a.hidden);
    }

    #[test]
    fn the_edge_brings_it_back() {
        let mut a = hidden_dock();
        assert_eq!(a.decide(idle(), false, 2000), None);
        assert_eq!(a.decide(Seen { at_edge: true, ..idle() }, false, 2100), Some(Slide::In));
        assert!(!a.hidden);
    }

    #[test]
    fn start_or_anything_in_use_brings_it_back() {
        let mut a = hidden_dock();
        assert_eq!(a.decide(Seen { busy: true, ..idle() }, false, 2000), Some(Slide::In));
    }

    #[test]
    fn the_desktop_holds_it_only_when_asked() {
        let mut a = hidden_dock();
        assert_eq!(a.decide(Seen { desktop: true, ..idle() }, false, 2000), None);
        assert_eq!(a.decide(Seen { desktop: true, ..idle() }, true, 2100), Some(Slide::In));
        for t in [3000, 9000] {
            assert_eq!(a.decide(Seen { desktop: true, ..idle() }, true, t), None, "stays up");
        }
    }

    #[test]
    fn fullscreen_or_a_locked_screen_never_wakes_it() {
        let mut a = hidden_dock();
        assert_eq!(a.decide(Seen { at_edge: true, fullscreen: true, ..idle() }, true, 2000), None);
        assert_eq!(a.decide(Seen { at_edge: true, locked: true, ..idle() }, true, 2100), None);
        assert!(a.hidden);
    }

    #[test]
    fn turning_the_option_off_brings_a_hidden_dock_back_once() {
        let mut a = hidden_dock();
        assert_eq!(a.reveal(), Some(Slide::In));
        assert_eq!(a.reveal(), None);
        assert_eq!(AutoHide::default().reveal(), None);
    }

    #[test]
    fn the_whole_edge_counts_but_only_the_last_row() {
        assert!(at_edge(5, 1079, FHD, Edge::Bottom));
        assert!(at_edge(1919, 1079, FHD, Edge::Bottom));
        assert!(!at_edge(5, 1077, FHD, Edge::Bottom));
        assert!(at_edge(900, 0, FHD, Edge::Top));
        assert!(!at_edge(900, 1079, FHD, Edge::Top));
        let left = Rect { x: -1920, y: 0, w: 1920, h: 1080 };
        assert!(!at_edge(5, 1079, left, Edge::Bottom), "another monitor's edge");
    }

    #[test]
    fn the_gap_under_the_bar_is_part_of_it() {
        assert!(on_dock(900, 1003, DOCK, FHD, Edge::Bottom));
        assert!(on_dock(900, 1078, DOCK, FHD, Edge::Bottom));
        assert!(!on_dock(900, 1000, DOCK, FHD, Edge::Bottom));
        assert!(!on_dock(300, 1040, DOCK, FHD, Edge::Bottom));
        assert!(on_dock(900, 2, TOP_DOCK, FHD, Edge::Top));
        assert!(!on_dock(900, 80, TOP_DOCK, FHD, Edge::Top));
    }

    #[test]
    fn it_slides_from_its_place_to_just_past_the_edge_and_back() {
        assert_eq!(slide_y(DOCK, FHD, Edge::Bottom, Slide::Out, 0.0), 1003);
        assert_eq!(slide_y(DOCK, FHD, Edge::Bottom, Slide::Out, 1.0), 1080);
        assert_eq!(slide_y(DOCK, FHD, Edge::Bottom, Slide::In, 0.0), 1080);
        assert_eq!(slide_y(DOCK, FHD, Edge::Bottom, Slide::In, 1.0), 1003);
        assert_eq!(slide_y(TOP_DOCK, FHD, Edge::Top, Slide::Out, 1.0), -69);
        assert_eq!(slide_y(TOP_DOCK, FHD, Edge::Top, Slide::In, 1.0), 8);
    }

    #[test]
    fn the_slide_eases_out() {
        let half = slide_y(DOCK, FHD, Edge::Bottom, Slide::Out, 0.5);
        assert!(half - 1003 > (1080 - 1003) / 2, "more than half way at half time: {half}");
        let mut last = 1003;
        for i in 0..=10 {
            let y = slide_y(DOCK, FHD, Edge::Bottom, Slide::Out, i as f64 / 10.0);
            assert!(y >= last);
            last = y;
        }
    }
}
