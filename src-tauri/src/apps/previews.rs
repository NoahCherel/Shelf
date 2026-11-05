//! Live pictures of an app's windows, above its icon, on hover. Windows itself draws them into
//! this window through DWM, so they stay live and cost next to nothing, and page screenshots
//! can't see them. The window never takes focus, so hovering can't disturb the app you're in.

use std::ffi::c_void;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use ::windows::core::BOOL;
use ::windows::Win32::Foundation::{HWND, POINT, RECT};
use ::windows::Win32::Graphics::Dwm::{
    DwmQueryThumbnailSourceSize, DwmRegisterThumbnail, DwmUnregisterThumbnail, DwmUpdateThumbnailProperties, DWM_THUMBNAIL_PROPERTIES, DWM_TNP_OPACITY,
    DWM_TNP_RECTDESTINATION, DWM_TNP_VISIBLE,
};
use ::windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

use super::merge::AppEntry;
use super::{current, windows};
use crate::shell::card::{card_rect, Span};
use crate::shell::dock::Rect;

const SLOT: f64 = 220.0;
const SMALLEST_SLOT: f64 = 120.0;
const GAP: f64 = 8.0;
const PADDING: f64 = 8.0;
const SCREEN_MARGIN: f64 = 8.0;
/// Padding, the title row and the picture, as in preview.css.
const HEIGHT: f64 = 170.0;
const DOCK_GAP: f64 = 8.0;
/// Long enough to cross from the icon to the strip.
const LEAVE_GRACE: Duration = Duration::from_millis(200);
const POINTER_CHECK: Duration = Duration::from_millis(400);

fn strip_width(count: usize, slot: f64) -> f64 {
    let count = count as f64;
    2.0 * PADDING + count * slot + (count - 1.0).max(0.0) * GAP
}

fn slot_width(count: usize, screen: f64) -> f64 {
    let room = screen - 2.0 * SCREEN_MARGIN - 2.0 * PADDING - (count as f64 - 1.0).max(0.0) * GAP;
    (room / count.max(1) as f64).clamp(SMALLEST_SLOT, SLOT)
}

fn most_that_fit(screen: f64) -> usize {
    (((screen - 2.0 * SCREEN_MARGIN - 2.0 * PADDING + GAP) / (SMALLEST_SLOT + GAP)).floor() as usize).max(1)
}

#[derive(Clone, Copy, PartialEq, Debug)]
struct Box4 {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

/// The largest box of the source's shape that fits the slot, centred in it.
fn fitted(source: (i32, i32), slot: Box4) -> Box4 {
    let (width, height) = (slot.right - slot.left, slot.bottom - slot.top);
    if source.0 <= 0 || source.1 <= 0 || width <= 0 || height <= 0 {
        return slot;
    }
    let scale = (width as f64 / source.0 as f64).min(height as f64 / source.1 as f64);
    let (w, h) = ((source.0 as f64 * scale).round() as i32, (source.1 as f64 * scale).round() as i32);
    let (left, top) = (slot.left + (width - w) / 2, slot.top + (height - h) / 2);
    Box4 { left, top, right: left + w, bottom: top + h }
}

/// On the dock, on the strip, or in the gap between the two when crossing it.
fn pointer_within(pointer: (i32, i32), dock: Rect, strip: Rect) -> bool {
    let (x, y) = pointer;
    let on_dock = x >= dock.x && x < dock.x + dock.w && y >= dock.y && y < dock.y + dock.h;
    let over_strip = x >= strip.x && x < strip.x + strip.w && y >= strip.y && y < dock.y;
    on_dock || over_strip
}

fn is_listed(entries: &[AppEntry], raw: isize) -> bool {
    entries.iter().any(|e| e.windows.iter().any(|w| w.hwnd == raw))
}

/// Whether the pointer has left, given that it may just be crossing from the icon to the strip.
#[derive(Default)]
struct Hover(AtomicU64);

impl Hover {
    fn keep(&self) -> u64 {
        self.0.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn leave(&self) -> u64 {
        self.0.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn still_leaving(&self, token: u64) -> bool {
        self.0.load(Ordering::SeqCst) == token
    }
}

static HOVER: Hover = Hover(AtomicU64::new(0));
/// The app being shown, and the pictures registered for it.
static SHOWN: Mutex<Option<String>> = Mutex::new(None);
static PICTURES: Mutex<Vec<isize>> = Mutex::new(Vec::new());

#[derive(Serialize, Clone)]
struct ShownWindow {
    hwnd: isize,
    title: String,
    minimized: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Shown {
    key: String,
    name: String,
    slot_width: f64,
    windows: Vec<ShownWindow>,
}

#[derive(Deserialize)]
pub struct Slot {
    hwnd: isize,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn preview_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("preview").ok_or_else(|| "preview window missing".to_string())
}

fn hwnd_of(raw: isize) -> HWND {
    HWND(raw as *mut c_void)
}

fn clear_pictures() {
    for picture in PICTURES.lock().unwrap_or_else(|e| e.into_inner()).drain(..) {
        unsafe {
            let _ = DwmUnregisterThumbnail(picture);
        }
    }
}

fn hide(app: &AppHandle) -> Result<(), String> {
    clear_pictures();
    *SHOWN.lock().unwrap_or_else(|e| e.into_inner()) = None;
    preview_window(app)?.hide().map_err(|e| e.to_string())?;
    app.emit("preview-closed", ()).map_err(|e| e.to_string())
}

/// A page isn't always told the pointer has gone, as when it leaves very fast. So while the strip
/// shows, the pointer itself is checked. The preview build is driven through the debug port, with
/// the real pointer elsewhere, so it relies on the page alone.
fn watch_pointer(app: AppHandle, dock: Rect, strip: Rect) {
    if crate::preview::is_on() {
        return;
    }
    std::thread::spawn(move || loop {
        std::thread::sleep(POINTER_CHECK);
        if SHOWN.lock().unwrap_or_else(|e| e.into_inner()).is_none() {
            return;
        }
        let mut pointer = POINT::default();
        if unsafe { GetCursorPos(&mut pointer) }.is_ok() && !pointer_within((pointer.x, pointer.y), dock, strip) {
            let _ = hide(&app);
            return;
        }
    });
}

/// Clicks on the strip mustn't take focus from your app, as with the dock.
pub fn prepare(app: &AppHandle) -> Result<(), String> {
    let window = preview_window(app)?;
    let raw = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        let style = GetWindowLongPtrW(HWND(raw.0), GWL_EXSTYLE);
        SetWindowLongPtrW(HWND(raw.0), GWL_EXSTYLE, style | WS_EX_NOACTIVATE.0 as isize);
    }
    Ok(())
}

/// Tile position is logical px inside the dock window.
#[tauri::command(async)]
pub fn preview_show(app: AppHandle, key: String, tile_x: f64, tile_width: f64) -> Result<(), String> {
    let opening = HOVER.keep();
    if SHOWN.lock().unwrap_or_else(|e| e.into_inner()).as_deref() == Some(key.as_str()) {
        return Ok(());
    }
    let entries = current()?;
    let Some(entry) = entries.iter().find(|e| e.key == key).filter(|e| !e.windows.is_empty()) else {
        return hide(&app);
    };
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let window = preview_window(&app)?;
    let run = || -> tauri::Result<Option<(Shown, Rect, Rect)>> {
        let Some(m) = dock.primary_monitor()? else { return Ok(None) };
        let scale = m.scale_factor();
        let screen = m.size().width as f64 / scale;
        let count = entry.windows.len().min(most_that_fit(screen));
        let slot = slot_width(count, screen);
        let (pos, size) = (dock.outer_position()?, dock.outer_size()?);
        let tile = Span { x: pos.x + (tile_x * scale).round() as i32, w: (tile_width * scale).round() as i32 };
        let dock_rect = Rect { x: pos.x, y: pos.y, w: size.width as i32, h: size.height as i32 };
        let r = card_rect(
            tile,
            dock_rect,
            Rect { x: m.position().x, y: m.position().y, w: m.size().width as i32, h: m.size().height as i32 },
            ((strip_width(count, slot) * scale).round() as i32, (HEIGHT * scale).round() as i32),
            (DOCK_GAP * scale).round() as i32,
        );
        window.set_size(PhysicalSize::new(r.w as u32, r.h as u32))?;
        window.set_position(PhysicalPosition::new(r.x, r.y))?;
        let strip = Rect { x: r.x, y: r.y, w: r.w, h: r.h };
        let shown = Shown {
            key: key.clone(),
            name: entry.name.clone(),
            slot_width: slot,
            windows: entry.windows[..count]
                .iter()
                .map(|w| ShownWindow { hwnd: w.hwnd, title: w.title.clone(), minimized: windows::is_minimized(w.hwnd) })
                .collect(),
        };
        Ok(Some((shown, dock_rect, strip)))
    };
    let Some((shown, dock_rect, strip)) = run().map_err(|e| e.to_string())? else { return Ok(()) };
    // The pointer may have moved on while the windows were being listed.
    if !HOVER.still_leaving(opening) {
        return Ok(());
    }
    clear_pictures();
    *SHOWN.lock().unwrap_or_else(|e| e.into_inner()) = Some(key);
    app.emit_to("preview", "preview-show", shown).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    watch_pointer(app.clone(), dock_rect, strip);
    Ok(())
}

/// Where the page laid out each picture, in logical px. Windows draws them from here on.
#[tauri::command(async)]
pub fn preview_slots(app: AppHandle, slots: Vec<Slot>) -> Result<(), String> {
    if SHOWN.lock().unwrap_or_else(|e| e.into_inner()).is_none() {
        return Ok(());
    }
    let window = preview_window(&app)?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let target = window.hwnd().map_err(|e| e.to_string())?;
    clear_pictures();
    let mut pictures = PICTURES.lock().unwrap_or_else(|e| e.into_inner());
    for slot in slots {
        unsafe {
            let Ok(picture) = DwmRegisterThumbnail(HWND(target.0), hwnd_of(slot.hwnd)) else { continue };
            pictures.push(picture);
            let source = DwmQueryThumbnailSourceSize(picture).map_or((0, 0), |s| (s.cx, s.cy));
            let room = Box4 {
                left: (slot.x * scale).round() as i32,
                top: (slot.y * scale).round() as i32,
                right: ((slot.x + slot.width) * scale).round() as i32,
                bottom: ((slot.y + slot.height) * scale).round() as i32,
            };
            let at = fitted(source, room);
            let properties = DWM_THUMBNAIL_PROPERTIES {
                dwFlags: DWM_TNP_RECTDESTINATION | DWM_TNP_VISIBLE | DWM_TNP_OPACITY,
                rcDestination: RECT { left: at.left, top: at.top, right: at.right, bottom: at.bottom },
                opacity: 255,
                fVisible: BOOL::from(true),
                ..Default::default()
            };
            let _ = DwmUpdateThumbnailProperties(picture, &properties);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn preview_keep() {
    HOVER.keep();
}

#[tauri::command]
pub fn preview_leave(app: AppHandle) {
    let token = HOVER.leave();
    std::thread::spawn(move || {
        std::thread::sleep(LEAVE_GRACE);
        if HOVER.still_leaving(token) {
            let _ = hide(&app);
        }
    });
}

#[tauri::command(async)]
pub fn preview_hide(app: AppHandle) -> Result<(), String> {
    HOVER.keep();
    hide(&app)
}

#[tauri::command(async)]
pub fn preview_activate(app: AppHandle, hwnd: isize) -> Result<(), String> {
    crate::preview::guard()?;
    if !is_listed(&current()?, hwnd) {
        return Err("window is gone".into());
    }
    windows::focus(hwnd);
    hide(&app)
}

#[tauri::command(async)]
pub fn preview_close_window(hwnd: isize) -> Result<(), String> {
    crate::preview::guard()?;
    if !is_listed(&current()?, hwnd) {
        return Err("window is gone".into());
    }
    windows::close(hwnd);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::apps::merge::{AppEntry, AppWindow};

    fn entry(handles: &[isize]) -> AppEntry {
        AppEntry {
            key: "a".into(),
            name: "A".into(),
            pinned: false,
            active: false,
            windows: handles.iter().map(|h| AppWindow { hwnd: *h, title: String::new() }).collect(),
            launch: None,
            icon_source: None,
        }
    }

    #[test]
    fn a_few_windows_get_full_size_pictures() {
        assert_eq!(slot_width(1, 1536.0), SLOT);
        assert_eq!(slot_width(3, 1536.0), SLOT);
    }

    #[test]
    fn many_windows_shrink_to_fit_the_screen() {
        let width = slot_width(8, 1536.0);
        assert!(width < SLOT && width >= SMALLEST_SLOT);
        assert!(strip_width(8, width) <= 1536.0 - 2.0 * SCREEN_MARGIN);
    }

    #[test]
    fn past_what_fits_the_strip_stops_adding() {
        let most = most_that_fit(1000.0);
        assert!(strip_width(most, SMALLEST_SLOT) <= 1000.0 - 2.0 * SCREEN_MARGIN);
        assert!(strip_width(most + 1, SMALLEST_SLOT) > 1000.0 - 2.0 * SCREEN_MARGIN);
    }

    #[test]
    fn a_very_narrow_screen_still_shows_one() {
        assert_eq!(most_that_fit(50.0), 1);
    }

    #[test]
    fn a_picture_keeps_its_shape_and_sits_centred() {
        // A wide window in a 200x100 slot at (10, 20).
        let slot = Box4 { left: 10, top: 20, right: 210, bottom: 120 };
        assert_eq!(fitted((1920, 480), slot), Box4 { left: 10, top: 45, right: 210, bottom: 95 });
        // A tall one.
        assert_eq!(fitted((500, 1000), slot), Box4 { left: 85, top: 20, right: 135, bottom: 120 });
    }

    #[test]
    fn a_window_reporting_no_size_fills_its_slot() {
        let slot = Box4 { left: 0, top: 0, right: 200, bottom: 100 };
        assert_eq!(fitted((0, 0), slot), slot);
    }

    #[test]
    fn only_windows_of_listed_apps_can_be_touched() {
        let entries = vec![entry(&[11, 22])];
        assert!(is_listed(&entries, 22));
        assert!(!is_listed(&entries, 33));
    }

    #[test]
    fn coming_back_in_time_stops_the_close() {
        let hover = Hover::default();
        let leaving = hover.leave();
        assert!(hover.still_leaving(leaving));
        hover.keep();
        assert!(!hover.still_leaving(leaving));
    }

    #[test]
    fn leaving_while_it_opens_cancels_the_opening() {
        let hover = Hover::default();
        let opening = hover.keep();
        assert!(hover.still_leaving(opening), "nothing has happened since");
        hover.leave();
        assert!(!hover.still_leaving(opening));
    }

    #[test]
    fn the_pointer_counts_on_the_dock_or_the_strip() {
        let dock = Rect { x: 300, y: 1000, w: 1000, h: 70 };
        let strip = Rect { x: 500, y: 820, w: 400, h: 170 };
        assert!(pointer_within((600, 1030), dock, strip));
        assert!(pointer_within((600, 900), dock, strip));
        assert!(!pointer_within((100, 100), dock, strip));
    }

    #[test]
    fn crossing_the_gap_between_them_still_counts() {
        let dock = Rect { x: 300, y: 1000, w: 1000, h: 70 };
        let strip = Rect { x: 500, y: 820, w: 400, h: 170 };
        assert!(pointer_within((600, 995), dock, strip));
        assert!(!pointer_within((1200, 900), dock, strip));
    }

    #[test]
    fn only_the_latest_leave_counts() {
        let hover = Hover::default();
        let first = hover.leave();
        let second = hover.leave();
        assert!(!hover.still_leaving(first));
        assert!(hover.still_leaving(second));
    }
}
