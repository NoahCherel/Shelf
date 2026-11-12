//! The dock's choices as saved in Settings, read once at start.

use super::super::taskbar::Mode;
use super::geometry::{DockLayout, Edge};

/// Auto-hide, and whether the dock stays up over the desktop.
pub fn saved_behaviour(settings: Option<&serde_json::Value>) -> (bool, bool) {
    let flag = |key: &str| settings.and_then(|s| s[key].as_bool()).unwrap_or(false);
    (flag("autoHide"), flag("showOnDesktop"))
}

pub fn saved_taskbar_mode(settings: Option<&serde_json::Value>) -> Mode {
    match settings.and_then(|s| s["taskbarMode"].as_str()) {
        Some("autohide") => Mode::Autohide,
        _ => Mode::Hidden,
    }
}

/// So the first placement is already right, before the page has reported anything.
pub fn saved_layout(settings: Option<&serde_json::Value>, base: DockLayout) -> DockLayout {
    let mut l = base;
    if let Some(s) = settings {
        l.float = s["floatOverWindows"].as_bool().unwrap_or(l.float);
        l.gap = s["edgeGap"].as_f64().unwrap_or(l.gap);
        l.bar = s["size"].as_f64().map_or(l.bar, |t| (t * 1.09).ceil());
        l.edge = Edge::from_name(s["edge"].as_str());
        l.along = s["pillAt"].as_f64().map_or(l.along, |at| at.clamp(0.0, 1.0));
        if s["dockWidth"].as_str() == Some("full") {
            l.gap = 0.0;
        }
    }
    l
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shell::dock::geometry::*;

    #[test]
    fn the_saved_edge_is_used_from_the_first_placement_and_full_width_sits_on_the_edge() {
        let top = saved_layout(Some(&serde_json::json!({ "edge": "top", "edgeGap": 10.0 })), FIRST_LAYOUT);
        assert_eq!((top.edge, top.gap), (Edge::Top, 10.0));
        let full = saved_layout(Some(&serde_json::json!({ "edgeGap": 10.0, "dockWidth": "full" })), FIRST_LAYOUT);
        assert_eq!((full.edge, full.gap), (Edge::Bottom, 0.0));
    }

    #[test]
    fn the_saved_auto_hide_choice_is_used_from_the_start() {
        assert_eq!(saved_behaviour(Some(&serde_json::json!({ "autoHide": true, "showOnDesktop": true }))), (true, true));
        assert_eq!(saved_behaviour(None), (false, false));
    }

    #[test]
    fn the_saved_spot_along_the_edge_is_used_from_the_start_and_kept_on_screen() {
        assert_eq!(saved_layout(Some(&serde_json::json!({ "pillAt": 0.2 })), FIRST_LAYOUT).along, 0.2);
        assert_eq!(saved_layout(Some(&serde_json::json!({ "pillAt": 7.0 })), FIRST_LAYOUT).along, 1.0);
        assert_eq!(saved_layout(None, FIRST_LAYOUT).along, 0.5);
    }
}
