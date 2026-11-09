//! The one shared card window: placed over its tile, closed by clicking away.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

use windows::Win32::Foundation::POINT;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON};
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

use super::dock::Rect;

const MARGIN: f64 = 8.0;
/// A click on a tile blurs the card before the click itself arrives, so a card
/// closed this recently was closed by the very click being handled.
const REOPEN_GUARD_MS: u64 = 250;
/// Windows moves focus from the window into its web view as it opens, which looks like clicking away.
const SETTLE_MS: u64 = 250;
/// Long lists scroll inside the card rather than reaching for the top of the screen.
const MAX_HEIGHT: f64 = 640.0;

fn limit_height(height: f64, room: f64) -> f64 {
    height.min(MAX_HEIGHT).min(room)
}

/// A dock in the top half of the screen opens things below it.
fn dock_is_at_top(dock: Rect, monitor: Rect) -> bool {
    dock.y + dock.h / 2 < monitor.y + monitor.h / 2
}

/// Logical px between the dock and the far edge of the screen, less a margin at each end.
fn room_for_card(dock: Rect, monitor: Rect, margin: i32, scale: f64) -> f64 {
    let room = if dock_is_at_top(dock, monitor) { monitor.y + monitor.h - (dock.y + dock.h) } else { dock.y - monitor.y };
    (room - 2 * margin) as f64 / scale
}

#[derive(Clone, Copy, Default)]
pub struct Span {
    pub x: i32,
    pub w: i32,
}

/// Centred on the tile, on the screen side of the dock, kept on the monitor. On a
/// screen too small for it, the card gets shorter rather than running off the edge.
pub fn card_rect(tile: Span, dock: Rect, monitor: Rect, size: (i32, i32), margin: i32) -> Rect {
    let (w, h) = size;
    let min_x = monitor.x + margin;
    let max_x = (monitor.x + monitor.w - w - margin).max(min_x);
    let x = (tile.x + tile.w / 2 - w / 2).clamp(min_x, max_x);
    if dock_is_at_top(dock, monitor) {
        let top = dock.y + dock.h + margin;
        return Rect { x, y: top, w, h: h.min(monitor.y + monitor.h - margin - top) };
    }
    let bottom = dock.y - margin;
    let top = (bottom - h).max(monitor.y + margin);
    Rect { x, y: top, w, h: bottom - top }
}

/// What the trace may say about a card: never the path of someone's file or folder.
fn traceable(id: &str) -> &str {
    if id.contains("item:") {
        id.split_once(':').map_or(id, |(kind, _)| kind)
    } else {
        id
    }
}

/// The menus a right-click opens, as opposed to cards a click toggles.
fn is_menu(id: &str) -> bool {
    id.starts_with("__menu:") || id.starts_with("__appmenu:")
}

#[derive(PartialEq, Debug)]
pub enum CardMove {
    Open,
    Close,
    Ignore,
}

#[derive(Default)]
pub struct CardState {
    pub open: Option<String>,
    last: Option<String>,
    closed_at: u64,
    opened_at: u64,
}

impl CardState {
    /// `focused` is whether the card window has the focus. One that doesn't was covered by another app
    /// the moment it opened, so a click on its tile brings it back rather than closing what can't be seen.
    pub fn request(&mut self, id: &str, now: u64, focused: bool) -> CardMove {
        // A right-click always opens its menu, as on Windows. Its press already closed any menu
        // that was open, as a click elsewhere, so toggling or the reopen guard would swallow it.
        if is_menu(id) || (self.open.as_deref() == Some(id) && !focused) {
            self.open = Some(id.to_string());
            self.opened_at = now;
            return CardMove::Open;
        }
        if self.open.as_deref() == Some(id) {
            self.closed(now);
            return CardMove::Close;
        }
        if self.last.as_deref() == Some(id) && now.saturating_sub(self.closed_at) < REOPEN_GUARD_MS {
            return CardMove::Ignore;
        }
        self.open = Some(id.to_string());
        self.opened_at = now;
        CardMove::Open
    }

    pub fn swap(&mut self, id: &str) {
        self.open = Some(id.to_string());
    }

    /// True when losing focus really does mean the card should close.
    pub fn blur_closes(&mut self, now: u64) -> bool {
        if now.saturating_sub(self.opened_at) < SETTLE_MS {
            return false;
        }
        self.closed(now);
        true
    }

    pub fn closed(&mut self, now: u64) {
        if let Some(id) = self.open.take() {
            self.last = Some(id);
            self.closed_at = now;
        }
    }
}

static STATE: Mutex<Option<CardState>> = Mutex::new(None);
static TILE: Mutex<Span> = Mutex::new(Span { x: 0, w: 0 });
static START: LazyLock<Instant> = LazyLock::new(Instant::now);

fn now() -> u64 {
    START.elapsed().as_millis() as u64
}

fn with_state<R>(f: impl FnOnce(&mut CardState) -> R) -> R {
    let mut guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
    f(guard.get_or_insert_with(CardState::default))
}

fn card_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("card").ok_or_else(|| "card window missing".to_string())
}

/// The only place the card hides. The page unmounts what it shows, which stops its providers
/// and drops anything typed into it.
fn hide_card(app: &AppHandle) -> Result<(), String> {
    crate::diag::note("card hidden");
    let card = card_window(app)?;
    card.hide().map_err(|e| e.to_string())?;
    let _ = app.emit_to("card", "card-closed", ());
    Ok(())
}

/// Sizes and moves the card for `logical` px, relative to the remembered tile.
fn place(app: &AppHandle, logical: (f64, f64)) -> Result<(), String> {
    let (card, dock) = (card_window(app)?, app.get_webview_window("dock").ok_or("dock window missing")?);
    let run = || -> tauri::Result<()> {
        let Some(m) = dock.primary_monitor()? else { return Ok(()) };
        let scale = m.scale_factor();
        let monitor = Rect { x: m.position().x, y: m.position().y, w: m.size().width as i32, h: m.size().height as i32 };
        let (pos, size) = (dock.outer_position()?, dock.outer_size()?);
        let dock_rect = Rect { x: pos.x, y: pos.y, w: size.width as i32, h: size.height as i32 };
        let tile = *TILE.lock().unwrap_or_else(|e| e.into_inner());
        let margin = (MARGIN * scale).round() as i32;
        let height = limit_height(logical.1, room_for_card(dock_rect, monitor, margin, scale));
        let wanted = ((logical.0 * scale).round() as i32, (height * scale).round() as i32);
        let r = card_rect(tile, dock_rect, monitor, wanted, margin);
        card.set_size(PhysicalSize::new(r.w as u32, r.h as u32))?;
        card.set_position(PhysicalPosition::new(r.x, r.y))
    };
    run().map_err(|e| e.to_string())
}

/// How tall a card may be here, so its body can scroll inside that rather than being cut off.
#[tauri::command]
pub fn card_room(app: AppHandle) -> Result<f64, String> {
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let run = || -> tauri::Result<f64> {
        let Some(m) = dock.primary_monitor()? else { return Ok(MAX_HEIGHT) };
        let scale = m.scale_factor();
        let monitor = Rect { x: m.position().x, y: m.position().y, w: m.size().width as i32, h: m.size().height as i32 };
        let (pos, size) = (dock.outer_position()?, dock.outer_size()?);
        let dock_rect = Rect { x: pos.x, y: pos.y, w: size.width as i32, h: size.height as i32 };
        let margin = (MARGIN * scale).round() as i32;
        Ok(limit_height(f64::MAX, room_for_card(dock_rect, monitor, margin, scale)))
    };
    run().map_err(|e| e.to_string())
}

/// Tile position is logical px inside the dock window.
#[tauri::command]
pub fn open_card(
    app: AppHandle,
    widget_id: String,
    tile_x: f64,
    tile_width: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let card = card_window(&app)?;
    let focused = card.is_focused().unwrap_or(true);
    let request = with_state(|s| s.request(&widget_id, now(), focused));
    crate::diag::note(&format!("card asked for {}, focused {focused}: {request:?}", traceable(&widget_id)));
    match request {
        CardMove::Ignore => return Ok(()),
        CardMove::Close => return hide_card(&app),
        CardMove::Open => {}
    }
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let scale = dock.scale_factor().map_err(|e| e.to_string())?;
    let origin = dock.outer_position().map_err(|e| e.to_string())?.x;
    *TILE.lock().unwrap_or_else(|e| e.into_inner()) =
        Span { x: origin + (tile_x * scale).round() as i32, w: (tile_width * scale).round() as i32 };
    place(&app, (width, height))?;
    app.emit_to("card", "card-open", &widget_id).map_err(|e| e.to_string())?;
    card.show().map_err(|e| e.to_string())?;
    card.set_focus().map_err(|e| e.to_string())?;
    // The dock doesn't take focus when clicked, so Windows may have refused that.
    if let Ok(hwnd) = card.hwnd() {
        crate::apps::take_foreground_raw(hwnd.0 as isize);
    }
    Ok(())
}

/// A different card in the same place, as when a panel leads to another.
#[tauri::command]
pub fn swap_card(app: AppHandle, widget_id: String, width: f64) -> Result<(), String> {
    with_state(|s| s.swap(&widget_id));
    place(&app, (width, 300.0))?;
    app.emit_to("card", "card-open", &widget_id).map_err(|e| e.to_string())
}

/// The page reports how tall its content is, once rendered.
#[tauri::command]
pub fn fit_card(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    // A card sized to nothing puts its page to sleep, and it then never grows back.
    if with_state(|s| s.open.is_none()) || width < 1.0 || height < 1.0 {
        return Ok(());
    }
    place(&app, (width, height))
}

/// A card or menu is showing.
pub fn is_open() -> bool {
    with_state(|s| s.open.is_some())
}

/// Catches up a page that loaded after `card-open` fired.
#[tauri::command]
pub fn card_current() -> Option<String> {
    with_state(|s| s.open.clone())
}

#[tauri::command]
pub fn close_card(app: AppHandle) -> Result<(), String> {
    with_state(|s| s.closed(now()));
    hide_card(&app)
}

/// Losing the focus while a button is held is a click somewhere else. Without one, another app took
/// the focus on its own, as Orca was recorded doing just after a menu opened, and the card stays.
pub fn blur_is_click_away(button_down: bool) -> bool {
    button_down
}

/// While the card is up without the focus, a press outside it is clicking away.
pub fn press_closes(button_down: bool, pointer: (i32, i32), card: Rect) -> bool {
    let (x, y) = pointer;
    let inside = x >= card.x && x < card.x + card.w && y >= card.y && y < card.y + card.h;
    button_down && !inside
}

fn button_down() -> bool {
    [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON].iter().any(|vk| unsafe { GetAsyncKeyState(vk.0 as i32) } < 0)
}

/// Down now, or pressed since the last check: a quick click can start and end between two checks.
fn button_pressed() -> bool {
    [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON].iter().any(|vk| unsafe { GetAsyncKeyState(vk.0 as i32) } as u16 & 0x8001 != 0)
}

const PRESS_CHECK: Duration = Duration::from_millis(40);
static WATCHING: AtomicBool = AtomicBool::new(false);

/// The card lost the focus without a click: closes it at the next press outside it, as it gets no
/// more blur to say so. Stops once it's closed or has the focus back.
fn close_at_next_press_outside(app: AppHandle) {
    if WATCHING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        // Clears the "pressed since" flag left by whatever came before.
        button_pressed();
        loop {
            std::thread::sleep(PRESS_CHECK);
            let Ok(card) = card_window(&app) else { break };
            if with_state(|s| s.open.is_none()) || card.is_focused().unwrap_or(false) {
                break;
            }
            let (Ok(pos), Ok(size)) = (card.outer_position(), card.outer_size()) else { break };
            let mut p = POINT::default();
            if unsafe { GetCursorPos(&mut p) }.is_err() {
                continue;
            }
            if press_closes(button_pressed(), (p.x, p.y), Rect { x: pos.x, y: pos.y, w: size.width as i32, h: size.height as i32 }) {
                with_state(|s| s.closed(now()));
                let _ = hide_card(&app);
                break;
            }
        }
        WATCHING.store(false, Ordering::SeqCst);
    });
}

/// Clicking away closes the card.
pub fn on_blur(window: &tauri::Window) {
    let down = button_down();
    crate::diag::note(&format!("card lost the focus, button down {down}; {}", crate::diag::card_window_state()));
    if crate::diag::enabled() {
        std::thread::spawn(|| {
            std::thread::sleep(Duration::from_millis(50));
            crate::diag::note(&format!("50 ms later: {}", crate::diag::card_window_state()));
        });
    }
    if !blur_is_click_away(down) {
        close_at_next_press_outside(window.app_handle().clone());
        return;
    }
    if with_state(|s| s.blur_closes(now())) {
        let _ = hide_card(window.app_handle());
    }
}

pub fn on_close(window: &tauri::Window) {
    with_state(|s| s.closed(now()));
    let _ = hide_card(window.app_handle());
}

#[cfg(test)]
mod tests {
    use super::*;

    const MONITOR: Rect = Rect { x: 0, y: 0, w: 1920, h: 1080 };
    const DOCK: Rect = Rect { x: 460, y: 1008, w: 1000, h: 72 };

    #[test]
    fn card_centres_on_the_tile_above_the_dock() {
        let r = card_rect(Span { x: 900, w: 100 }, DOCK, MONITOR, (300, 400), 8);
        assert_eq!(r, Rect { x: 800, y: 600, w: 300, h: 400 });
    }

    #[test]
    fn card_clamps_to_the_left_and_right_of_the_monitor() {
        let left = card_rect(Span { x: 0, w: 50 }, DOCK, MONITOR, (300, 400), 8);
        assert_eq!(left.x, 8);
        let right = card_rect(Span { x: 1900, w: 20 }, DOCK, MONITOR, (300, 400), 8);
        assert_eq!(right.x, 1920 - 300 - 8);
    }

    #[test]
    fn card_respects_a_monitor_with_an_offset_origin() {
        let m = Rect { x: -1920, y: 0, w: 1920, h: 1080 };
        let dock = Rect { x: -1460, y: 1008, w: 1000, h: 72 };
        let r = card_rect(Span { x: -1900, w: 50 }, dock, m, (300, 400), 8);
        assert_eq!(r.x, -1920 + 8);
    }

    #[test]
    fn card_never_rises_past_the_top_of_a_small_screen() {
        let m = Rect { x: 0, y: 0, w: 1280, h: 600 };
        let dock = Rect { x: 200, y: 528, w: 800, h: 72 };
        let r = card_rect(Span { x: 500, w: 100 }, dock, m, (300, 900), 8);
        assert_eq!(r.y, 8, "top margin kept");
        assert_eq!(r.h, 528 - 8 - 8, "height reduced, still above the dock");
    }

    const TOP_DOCK: Rect = Rect { x: 460, y: 8, w: 1000, h: 72 };

    #[test]
    fn with_the_dock_at_the_top_the_card_opens_below_it() {
        let r = card_rect(Span { x: 900, w: 100 }, TOP_DOCK, MONITOR, (300, 400), 8);
        assert_eq!(r, Rect { x: 800, y: 88, w: 300, h: 400 });
    }

    #[test]
    fn below_a_top_dock_the_card_never_passes_the_bottom_of_the_screen() {
        let r = card_rect(Span { x: 900, w: 100 }, TOP_DOCK, MONITOR, (300, 5000), 8);
        assert_eq!((r.y, r.y + r.h), (88, 1080 - 8));
    }

    #[test]
    fn below_a_top_dock_the_room_is_what_lies_under_it() {
        assert_eq!(room_for_card(TOP_DOCK, MONITOR, 8, 1.0), 984.0);
        assert_eq!(room_for_card(TOP_DOCK, MONITOR, 8, 2.0), 492.0);
    }

    #[test]
    fn a_top_dock_is_recognised_on_a_monitor_with_an_offset_origin() {
        let m = Rect { x: 0, y: -1080, w: 1920, h: 1080 };
        let dock = Rect { x: 460, y: -1072, w: 1000, h: 72 };
        let r = card_rect(Span { x: 900, w: 100 }, dock, m, (300, 400), 8);
        assert_eq!(r.y, -1072 + 72 + 8);
    }

    #[test]
    fn clicking_the_open_card_tile_closes_it() {
        let mut s = CardState::default();
        assert_eq!(s.request("clock", 0, true), CardMove::Open);
        assert_eq!(s.request("clock", 10, true), CardMove::Close);
    }

    #[test]
    fn the_blur_from_clicking_the_same_tile_does_not_reopen_it() {
        let mut s = CardState::default();
        s.request("clock", 0, true);
        s.closed(1000); // clicking the tile blurs the card before the click arrives
        assert_eq!(s.request("clock", 1100, true), CardMove::Ignore);
        assert_eq!(s.request("clock", 1400, true), CardMove::Open, "a later click is real");
    }

    #[test]
    fn the_focus_settling_right_after_opening_does_not_close_it() {
        let mut s = CardState::default();
        s.request("clock", 1000, true);
        assert!(!s.blur_closes(1100), "Windows moves focus into the web view as it opens");
        assert!(s.open.is_some());
        assert!(s.blur_closes(1400), "clicking away later does close it");
        assert!(s.open.is_none());
    }

    #[test]
    fn after_a_swap_the_same_tile_closes_the_new_card() {
        let mut s = CardState::default();
        s.request("quick", 0, true);
        s.swap("wifi");
        assert_eq!(s.open.as_deref(), Some("wifi"));
        assert_eq!(s.request("wifi", 1000, true), CardMove::Close);
    }

    #[test]
    fn every_way_of_closing_announces_it() {
        // One place hides the card, and it also tells the page, which then unmounts what it shows.
        let source = include_str!("card.rs");
        let code = &source[..source.find("#[cfg(test)]").unwrap()];
        assert_eq!(code.matches(".hide()").count(), 1);
        assert!(code.contains("card-closed"));
    }

    #[test]
    fn cards_stop_growing_at_640() {
        assert_eq!(limit_height(300.0, 900.0), 300.0);
        assert_eq!(limit_height(2000.0, 900.0), 640.0);
    }

    #[test]
    fn a_short_screen_limits_the_card_to_the_room_above_the_dock() {
        assert_eq!(limit_height(2000.0, 500.0), 500.0);
        assert_eq!(limit_height(300.0, 500.0), 300.0);
    }

    #[test]
    fn the_room_is_what_lies_above_the_dock() {
        let monitor = Rect { x: 0, y: 0, w: 1366, h: 768 };
        let dock = Rect { x: 200, y: 700, w: 900, h: 68 };
        assert_eq!(room_for_card(dock, monitor, 8, 1.0), 684.0);
        assert_eq!(room_for_card(dock, monitor, 8, 2.0), 342.0);
    }

    #[test]
    fn a_card_another_app_came_in_front_of_is_brought_back_rather_than_closed() {
        let mut s = CardState::default();
        assert_eq!(s.request("clock", 0, true), CardMove::Open);
        // Another app covered it at once, so it never had the focus: the next click shows it again.
        assert_eq!(s.request("clock", 1000, false), CardMove::Open);
        assert_eq!(s.open.as_deref(), Some("clock"));
        assert_eq!(s.request("clock", 2000, true), CardMove::Close, "in front and focused, the same click closes it");
    }

    #[test]
    fn losing_the_focus_to_a_click_elsewhere_closes_it_but_not_to_an_app_taking_it() {
        assert!(blur_is_click_away(true));
        assert!(!blur_is_click_away(false), "Orca took the focus on its own: the card stays");
    }

    #[test]
    fn once_another_app_has_the_focus_a_press_outside_the_card_closes_it() {
        let card = Rect { x: 800, y: 600, w: 300, h: 400 };
        assert!(press_closes(true, (100, 100), card));
        assert!(!press_closes(true, (900, 700), card), "a press on the card itself");
        assert!(!press_closes(false, (100, 100), card), "no press, nothing to close for");
    }

    #[test]
    fn every_right_click_opens_its_menu_even_right_after_one_closed() {
        let mut s = CardState::default();
        assert_eq!(traceable(r"__stack:item:c:\users\me\secret"), "__stack");
        assert_eq!(traceable(r"__appmenu:item:c:\a.txt"), "__appmenu");
        assert_eq!(traceable("__appmenu:discord"), "__appmenu:discord");
        assert_eq!(s.request("__appmenu:discord", 0, true), CardMove::Open);
        // The press of the next right-click closes the open menu as a click elsewhere...
        s.closed(400);
        // ...and its release, 100 ms later, still opens the menu.
        assert_eq!(s.request("__appmenu:discord", 500, false), CardMove::Open);
        assert_eq!(s.request("__menu:clock", 600, true), CardMove::Open);
        assert_eq!(s.request("__menu:clock", 700, true), CardMove::Open, "not closed by its own right-click");
    }

    #[test]
    fn another_tile_opens_straight_away() {
        let mut s = CardState::default();
        s.request("clock", 0, true);
        s.closed(1000);
        assert_eq!(s.request("battery", 1050, true), CardMove::Open);
        assert_eq!(s.open.as_deref(), Some("battery"));
    }
}
