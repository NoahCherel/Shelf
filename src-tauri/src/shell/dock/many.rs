//! A dock on every screen (F-018): which dock windows to keep, open and close as screens come and go.
//! The window `dock` is always the main screen's, and never closes; the others are `dock-2`, `dock-3`…

use super::super::displays::{Display, DisplayMode};

/// What to do with the dock windows: `keep` pairs a label with the screen it goes on.
#[derive(Debug, PartialEq, Default)]
pub struct DockPlan {
    pub keep: Vec<(String, String)>,
    /// Screens that need a new dock.
    pub create: Vec<String>,
    /// Docks to close.
    pub close: Vec<String>,
}

pub const MAIN: &str = "dock";

/// Shelf's dock windows: the main one and the extra ones.
pub fn is_dock(label: &str) -> bool {
    label == MAIN || label.strip_prefix("dock-").is_some_and(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
}

/// `slots` pairs each open dock's label with its screen's id.
pub fn plan_docks(displays: &[Display], mode: DisplayMode, slots: &[(String, String)]) -> DockPlan {
    let mut plan = DockPlan::default();
    let extras = slots.iter().filter(|(label, _)| label != MAIN);
    if mode != DisplayMode::All {
        plan.close = extras.map(|(label, _)| label.clone()).collect();
        return plan;
    }
    let Some(main) = displays.iter().find(|d| d.primary).or(displays.first()) else { return plan };
    plan.keep.push((MAIN.to_string(), main.id.clone()));
    for (label, screen) in extras {
        // An extra dock stays only on a screen that's still there and isn't the main one's.
        let stays = *screen != main.id && displays.iter().any(|d| d.id == *screen) && !plan.keep.iter().any(|(_, s)| s == screen);
        if stays {
            plan.keep.push((label.clone(), screen.clone()));
        } else {
            plan.close.push(label.clone());
        }
    }
    plan.create = displays.iter().filter(|d| !plan.keep.iter().any(|(_, s)| *s == d.id)).map(|d| d.id.clone()).collect();
    plan
}

/// The first `dock-N` not in use.
pub fn free_label(used: &[String]) -> String {
    (2..).map(|n| format!("dock-{n}")).find(|label| !used.contains(label)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shell::dock::Rect;

    fn screen(id: &str, primary: bool) -> Display {
        Display { id: id.into(), name: id.into(), primary, rect: Rect { x: 0, y: 0, w: 1920, h: 1080 }, scale: 1.0 }
    }

    fn slots(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs.iter().map(|(l, d)| (l.to_string(), d.to_string())).collect()
    }

    #[test]
    fn all_screens_get_a_dock_and_the_main_one_keeps_the_first() {
        let plan = plan_docks(&[screen("A", true), screen("B", false)], DisplayMode::All, &slots(&[("dock", "A")]));
        assert_eq!(plan.keep, slots(&[("dock", "A")]));
        assert_eq!(plan.create, vec!["B".to_string()]);
        assert!(plan.close.is_empty());
    }

    #[test]
    fn unplugging_a_screen_closes_only_its_dock() {
        let plan = plan_docks(&[screen("A", true)], DisplayMode::All, &slots(&[("dock", "A"), ("dock-2", "B")]));
        assert_eq!(plan.keep, slots(&[("dock", "A")]));
        assert_eq!(plan.close, vec!["dock-2".to_string()]);
        assert!(plan.create.is_empty());
    }

    #[test]
    fn the_main_dock_follows_the_main_screen() {
        let plan = plan_docks(&[screen("A", false), screen("B", true)], DisplayMode::All, &slots(&[("dock", "A"), ("dock-2", "B")]));
        assert_eq!(plan.keep, slots(&[("dock", "B")]));
        assert_eq!(plan.close, vec!["dock-2".to_string()]);
        assert_eq!(plan.create, vec!["A".to_string()]);
    }

    #[test]
    fn going_back_to_one_screen_closes_the_extras() {
        let all = [screen("A", true), screen("B", false), screen("C", false)];
        let plan = plan_docks(&all, DisplayMode::Single, &slots(&[("dock", "A"), ("dock-2", "B"), ("dock-3", "C")]));
        assert_eq!(plan.close, vec!["dock-2".to_string(), "dock-3".to_string()]);
        assert!(plan.create.is_empty());
    }

    #[test]
    fn dock_labels_are_recognised() {
        assert!(is_dock("dock") && is_dock("dock-2") && is_dock("dock-12"));
        assert!(!is_dock("docks") && !is_dock("card") && !is_dock("dock-") && !is_dock("dock-x"));
    }

    #[test]
    fn new_docks_take_the_first_free_number() {
        assert_eq!(free_label(&["dock".into()]), "dock-2");
        assert_eq!(free_label(&["dock".into(), "dock-2".into(), "dock-4".into()]), "dock-3");
    }
}
