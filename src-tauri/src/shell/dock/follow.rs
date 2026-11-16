//! Follow: holding the pointer at another screen's edge brings the dock to that screen.

use super::super::autohide::at_edge;
use super::super::displays::Display;
use super::geometry::Edge;

/// How long the pointer must stay at the edge: passing through on the way elsewhere doesn't count.
pub const FOLLOW_HOLD_MS: u64 = 500;

#[derive(Default)]
pub struct Follow {
    /// The screen whose edge the pointer is at, and since when.
    since: Option<(String, u64)>,
    /// Already sent there: nothing more until the pointer leaves the edge.
    fired: Option<String>,
}

impl Follow {
    /// The id of the screen to move the dock to, once the pointer has been held at its edge.
    pub fn decide(&mut self, pointer: (i32, i32), displays: &[Display], current: &str, edge: Edge, now: u64) -> Option<String> {
        let at = displays.iter().find(|d| d.id != current && at_edge(pointer.0, pointer.1, d.rect, edge));
        let Some(id) = at.map(|d| d.id.clone()) else {
            self.since = None;
            self.fired = None;
            return None;
        };
        if self.fired.as_deref() == Some(id.as_str()) {
            return None;
        }
        match &self.since {
            Some((held, since)) if *held == id => {
                if now.saturating_sub(*since) < FOLLOW_HOLD_MS {
                    return None;
                }
                self.since = None;
                self.fired = Some(id.clone());
                Some(id)
            }
            _ => {
                self.since = Some((id, now));
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shell::dock::Rect;

    fn screens() -> Vec<Display> {
        let screen = |id: &str, x: i32, primary: bool| Display {
            id: id.into(),
            name: id.into(),
            primary,
            rect: Rect { x, y: 0, w: 1920, h: 1080 },
            scale: 1.0,
        };
        vec![screen("A", 0, true), screen("B", 1920, false)]
    }

    const BOTTOM_OF_B: (i32, i32) = (2500, 1079);
    const MIDDLE_OF_B: (i32, i32) = (2500, 500);

    #[test]
    fn holding_the_pointer_at_another_screen_s_edge_moves_the_dock_there() {
        let (all, mut f) = (screens(), Follow::default());
        assert_eq!(f.decide(BOTTOM_OF_B, &all, "A", Edge::Bottom, 0), None);
        assert_eq!(f.decide(BOTTOM_OF_B, &all, "A", Edge::Bottom, 499), None);
        assert_eq!(f.decide(BOTTOM_OF_B, &all, "A", Edge::Bottom, 500), Some("B".to_string()));
    }

    #[test]
    fn passing_through_an_edge_does_not_move_it() {
        let (all, mut f) = (screens(), Follow::default());
        f.decide(BOTTOM_OF_B, &all, "A", Edge::Bottom, 0);
        assert_eq!(f.decide(MIDDLE_OF_B, &all, "A", Edge::Bottom, 300), None);
        f.decide(BOTTOM_OF_B, &all, "A", Edge::Bottom, 600);
        assert_eq!(f.decide(BOTTOM_OF_B, &all, "A", Edge::Bottom, 1000), None);
        assert_eq!(f.decide(BOTTOM_OF_B, &all, "A", Edge::Bottom, 1100), Some("B".to_string()));
    }

    #[test]
    fn the_dock_s_own_screen_never_triggers() {
        let (all, mut f) = (screens(), Follow::default());
        for t in (0..2000).step_by(100) {
            assert_eq!(f.decide((500, 1079), &all, "A", Edge::Bottom, t), None);
        }
    }

    #[test]
    fn the_top_edge_counts_when_the_dock_is_at_the_top() {
        let (all, mut f) = (screens(), Follow::default());
        assert_eq!(f.decide(BOTTOM_OF_B, &all, "A", Edge::Top, 0), None);
        assert_eq!(f.decide(BOTTOM_OF_B, &all, "A", Edge::Top, 600), None, "the bottom doesn't count at the top");
        f.decide((2500, 0), &all, "A", Edge::Top, 1000);
        assert_eq!(f.decide((2500, 0), &all, "A", Edge::Top, 1500), Some("B".to_string()));
    }

    #[test]
    fn it_fires_once_until_the_pointer_leaves_the_edge() {
        let (all, mut f) = (screens(), Follow::default());
        f.decide(BOTTOM_OF_B, &all, "A", Edge::Bottom, 0);
        assert!(f.decide(BOTTOM_OF_B, &all, "A", Edge::Bottom, 500).is_some());
        assert_eq!(f.decide(BOTTOM_OF_B, &all, "A", Edge::Bottom, 1500), None);
    }
}
