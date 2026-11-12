//! Where the dock sits and what it reserves, as pure arithmetic on rectangles.

#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Edge {
    Bottom,
    Top,
}

impl Edge {
    pub fn from_name(name: Option<&str>) -> Edge {
        if name == Some("top") {
            Edge::Top
        } else {
            Edge::Bottom
        }
    }
}

/// Until the page reports, and before Settings are read.
pub const FIRST_LAYOUT: DockLayout = DockLayout { width: 400.0, bar: 55.0, gap: 6.0, float: true, edge: Edge::Bottom, along: 0.5 };

/// What the page reports, in logical pixels.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct DockLayout {
    pub width: f64,
    pub bar: f64,
    pub gap: f64,
    /// Over other windows, reserving nothing. Otherwise maximized windows stop short of the dock.
    pub float: bool,
    pub edge: Edge,
    /// Where a pill sits along its edge: 0 at the left end, 1 at the right, 0.5 in the middle.
    pub along: f64,
}

/// Near an edge of the monitor, `along` it, in physical pixels. The window is only as
/// tall as the bar: the gap stays outside it, so it can't swallow clicks.
pub fn dock_rect(monitor: Rect, scale: f64, logical_width: f64, bar: f64, gap: f64, edge: Edge, along: f64) -> Rect {
    let w = ((logical_width * scale).ceil() as i32).clamp(1, monitor.w);
    let h = (bar * scale).round() as i32;
    let lift = (gap * scale).round() as i32;
    let y = match edge {
        Edge::Bottom => monitor.y + monitor.h - lift - h,
        Edge::Top => monitor.y + lift,
    };
    let x = monitor.x + ((monitor.w - w) as f64 * along.clamp(0.0, 1.0)).round() as i32;
    Rect { x, y, w, h }
}

/// The strip of the screen to keep clear (left, top, right, bottom).
pub fn reserved_rect(monitor: Rect, height: i32, edge: Edge) -> (i32, i32, i32, i32) {
    let (left, right) = (monitor.x, monitor.x + monitor.w);
    match edge {
        Edge::Bottom => (left, monitor.y + monitor.h - height, right, monitor.y + monitor.h),
        Edge::Top => (left, monitor.y, right, monitor.y + height),
    }
}

/// Where the window goes while it's being dragged, `dx` and `dy` logical px from where it rests.
pub fn dragged(rest: Rect, monitor: Rect, scale: f64, dx: f64, dy: f64) -> (i32, i32) {
    (
        (rest.x + (dx * scale).round() as i32).clamp(monitor.x, monitor.x + monitor.w - rest.w),
        (rest.y + (dy * scale).round() as i32).clamp(monitor.y, monitor.y + monitor.h - rest.h),
    )
}

/// How much of the screen edge to keep clear, in physical pixels; None when floating.
pub fn reserved_height(layout: DockLayout, scale: f64) -> Option<i32> {
    let bar = (layout.bar * scale).round() as i32;
    let gap = (layout.gap * scale).round() as i32;
    (!layout.float).then_some(bar + gap)
}

/// A dock that slides away keeps no part of the screen.
pub fn reserved_with(layout: DockLayout, scale: f64, auto_hide: bool) -> Option<i32> {
    if auto_hide {
        None
    } else {
        reserved_height(layout, scale)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FHD: Rect = Rect { x: 0, y: 0, w: 1920, h: 1080 };

    #[test]
    fn dock_is_centred_on_monitor() {
        let r = dock_rect(FHD, 1.0, 1000.0, 72.0, 0.0, Edge::Bottom, 0.5);
        assert_eq!(r, Rect { x: 460, y: 1008, w: 1000, h: 72 });
    }

    #[test]
    fn dock_never_exceeds_monitor_width() {
        let r = dock_rect(FHD, 1.0, 5000.0, 72.0, 0.0, Edge::Bottom, 0.5);
        assert_eq!((r.x, r.w), (0, 1920));
    }

    #[test]
    fn dock_rect_is_correct_at_100_125_150_percent() {
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0, 0.0, Edge::Bottom, 0.5), Rect { x: 560, y: 1008, w: 800, h: 72 });
        assert_eq!(dock_rect(FHD, 1.25, 800.0, 72.0, 0.0, Edge::Bottom, 0.5), Rect { x: 460, y: 990, w: 1000, h: 90 });
        assert_eq!(dock_rect(FHD, 1.5, 800.0, 72.0, 0.0, Edge::Bottom, 0.5), Rect { x: 360, y: 972, w: 1200, h: 108 });
    }

    #[test]
    fn monitor_with_offset_origin_is_respected() {
        let left = Rect { x: -1920, y: 200, w: 1920, h: 1080 };
        assert_eq!(dock_rect(left, 1.0, 1000.0, 72.0, 0.0, Edge::Bottom, 0.5), Rect { x: -1460, y: 1208, w: 1000, h: 72 });
    }

    #[test]
    fn a_pill_sits_wherever_it_was_put_along_its_edge() {
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0, 0.0, Edge::Bottom, 0.0).x, 0);
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0, 0.0, Edge::Bottom, 1.0).x, 1120);
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0, 0.0, Edge::Top, 0.25).x, 280);
        let left = Rect { x: -1920, y: 0, w: 1920, h: 1080 };
        assert_eq!(dock_rect(left, 1.0, 800.0, 72.0, 0.0, Edge::Bottom, 1.0).x, -800);
        assert_eq!(dock_rect(FHD, 1.0, 1920.0, 72.0, 0.0, Edge::Bottom, 0.9).x, 0, "full width has nowhere to go");
    }

    #[test]
    fn the_gap_lifts_the_window_instead_of_adding_a_dead_strip_to_it() {
        let r = dock_rect(FHD, 1.25, 800.0, 55.0, 6.0, Edge::Bottom, 0.5);
        assert_eq!(r.h, 69, "only the bar");
        assert_eq!(r.y + r.h, 1080 - 8, "6 logical px above the edge at 125%");
    }

    #[test]
    fn floating_reserves_nothing_and_docked_reserves_bar_and_gap() {
        assert_eq!(reserved_height(DockLayout { width: 800.0, bar: 55.0, gap: 6.0, float: true, edge: Edge::Bottom, along: 0.5 }, 1.25), None);
        assert_eq!(reserved_height(DockLayout { width: 800.0, bar: 55.0, gap: 6.0, float: false, edge: Edge::Bottom, along: 0.5 }, 1.25), Some(77));
    }

    #[test]
    fn at_the_top_the_gap_is_above_the_window() {
        assert_eq!(dock_rect(FHD, 1.0, 800.0, 72.0, 0.0, Edge::Top, 0.5), Rect { x: 560, y: 0, w: 800, h: 72 });
        assert_eq!(dock_rect(FHD, 1.25, 800.0, 72.0, 6.0, Edge::Top, 0.5), Rect { x: 460, y: 8, w: 1000, h: 90 });
        assert_eq!(dock_rect(FHD, 1.5, 800.0, 72.0, 6.0, Edge::Top, 0.5), Rect { x: 360, y: 9, w: 1200, h: 108 });
    }

    #[test]
    fn the_reserved_strip_follows_the_edge_and_the_monitor() {
        let m = Rect { x: -1920, y: 200, w: 1920, h: 1080 };
        assert_eq!(reserved_rect(m, 77, Edge::Bottom), (-1920, 1203, 0, 1280));
        assert_eq!(reserved_rect(m, 77, Edge::Top), (-1920, 200, 0, 277));
    }

    #[test]
    fn dragging_stays_on_the_monitor() {
        let r = Rect { x: 460, y: 1008, w: 1000, h: 72 };
        assert_eq!(dragged(r, FHD, 1.0, 0.0, -300.0).1, 708);
        assert_eq!(dragged(r, FHD, 1.25, 0.0, -100.0).1, 883);
        assert_eq!(dragged(r, FHD, 1.0, 0.0, -5000.0).1, 0);
        assert_eq!(dragged(r, FHD, 1.0, 0.0, 5000.0).1, 1008);
        assert_eq!(dragged(r, FHD, 1.0, -200.0, 0.0), (260, 1008));
        assert_eq!(dragged(r, FHD, 1.25, 100.0, 0.0).0, 585);
        assert_eq!(dragged(r, FHD, 1.0, -5000.0, 0.0).0, 0);
        assert_eq!(dragged(r, FHD, 1.0, 5000.0, 0.0).0, 920);
    }

    #[test]
    fn auto_hide_reserves_nothing() {
        let docked = DockLayout { width: 800.0, bar: 55.0, gap: 6.0, float: false, edge: Edge::Bottom, along: 0.5 };
        assert_eq!(reserved_with(docked, 1.25, true), None);
        assert_eq!(reserved_with(docked, 1.25, false), Some(77));
    }
}
