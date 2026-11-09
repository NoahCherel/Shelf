//! Live pictures of an app's windows, above its icon, on hover. Windows itself draws them into
//! this window through DWM, so they stay live and cost next to nothing, and page screenshots
//! can't see them. The window never takes focus, so hovering can't disturb the app you're in.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use ::windows::core::{w, BOOL, HRESULT, PCSTR};
use ::windows::Win32::Foundation::{HWND, POINT, RECT};
use ::windows::Win32::Graphics::Dwm::{
    DwmQueryThumbnailSourceSize, DwmRegisterThumbnail, DwmSetWindowAttribute, DwmUnregisterThumbnail, DwmUpdateThumbnailProperties,
    DWMWA_EXCLUDED_FROM_PEEK, DWM_THUMBNAIL_PROPERTIES, DWM_TNP_OPACITY, DWM_TNP_RECTDESTINATION, DWM_TNP_VISIBLE,
};
use ::windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
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
/// The name bubble shown over an app with no previews to show.
const NAME_HEIGHT: f64 = 32.0;
pub const NAME_MIN_WIDTH: f64 = 48.0;
pub const NAME_MAX_WIDTH: f64 = 320.0;
const DOCK_GAP: f64 = 8.0;
/// Long enough to cross from the icon to the strip, even slowly.
const LEAVE_GRACE: Duration = Duration::from_millis(400);
const POINTER_CHECK: Duration = Duration::from_millis(300);
/// In a row, so a brief trip outside on the way to the strip doesn't count.
const CHECKS_OUTSIDE: u32 = 2;

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

/// On the strip, or in the gap between it and the dock, whichever side of the dock it opened on.
fn heading_for_strip(pointer: (i32, i32), dock: Rect, strip: Rect) -> bool {
    let (x, y) = pointer;
    let (top, bottom) = if strip.y >= dock.y + dock.h { (dock.y + dock.h, strip.y + strip.h) } else { (strip.y, dock.y) };
    x >= strip.x && x < strip.x + strip.w && y >= top && y < bottom
}

fn pointer_within(pointer: (i32, i32), dock: Rect, strip: Rect) -> bool {
    let (x, y) = pointer;
    let on_dock = x >= dock.x && x < dock.x + dock.w && y >= dock.y && y < dock.y + dock.h;
    on_dock || heading_for_strip(pointer, dock, strip)
}

fn real_pointer() -> Option<(i32, i32)> {
    let mut pointer = POINT::default();
    unsafe { GetCursorPos(&mut pointer) }.ok()?;
    Some((pointer.x, pointer.y))
}

/// Calls can finish out of order, and a late "stop" would end the peek under the pointer.
fn is_newest(last: &AtomicU64, seq: u64) -> bool {
    last.fetch_max(seq, Ordering::SeqCst) < seq
}

/// A minimized window reports a tiny size, though its picture still has the shape it had when open.
fn source_shape(reported: (i32, i32), minimized: bool, normal: (i32, i32)) -> (i32, i32) {
    if minimized && normal.0 > 0 && normal.1 > 0 {
        normal
    } else {
        reported
    }
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
static ON_STRIP: Mutex<Vec<isize>> = Mutex::new(Vec::new());
static PEEKING: AtomicBool = AtomicBool::new(false);
static LAST_PEEK: AtomicU64 = AtomicU64::new(0);
static OPENINGS: AtomicU64 = AtomicU64::new(0);
/// Where the dock and strip are, while the strip shows.
static AREA: Mutex<Option<(Rect, Rect)>> = Mutex::new(None);

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
    /// A bubble during a drag, shown with the app's picture.
    hint: bool,
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
    crate::diag::note("previews hidden");
    ON_STRIP.lock().unwrap_or_else(|e| e.into_inner()).clear();
    let _ = set_peek(app, None);
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
    *AREA.lock().unwrap_or_else(|e| e.into_inner()) = Some((dock, strip));
    // A newer strip brings its own watcher.
    let mine = OPENINGS.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        let mut outside = 0;
        loop {
            std::thread::sleep(POINTER_CHECK);
            if SHOWN.lock().unwrap_or_else(|e| e.into_inner()).is_none() || OPENINGS.load(Ordering::SeqCst) != mine {
                return;
            }
            outside = match real_pointer() {
                Some(pointer) if !pointer_within(pointer, dock, strip) => outside + 1,
                _ => 0,
            };
            if outside >= CHECKS_OUTSIDE {
                let _ = hide(&app);
                return;
            }
        }
    });
}

fn may_peek(shown: &[isize], raw: isize) -> bool {
    shown.contains(&raw)
}

/// Windows' own Aero Peek, which has no public name, only a number in dwmapi. It shows one window
/// over the others without activating it, until told to stop.
type LivePreview = unsafe extern "system" fn(BOOL, HWND, HWND, u32, *mut c_void) -> HRESULT;
const LIVE_PREVIEW_ORDINAL: usize = 113;
const PEEK_AT_WINDOW: u32 = 3;

fn live_preview() -> Option<LivePreview> {
    static FOUND: OnceLock<Option<usize>> = OnceLock::new();
    let found = FOUND.get_or_init(|| unsafe {
        let library = LoadLibraryW(w!("dwmapi.dll")).ok()?;
        GetProcAddress(library, PCSTR(LIVE_PREVIEW_ORDINAL as *const u8)).map(|f| f as usize)
    });
    found.map(|address| unsafe { std::mem::transmute::<usize, LivePreview>(address) })
}

/// The strip stays up during a peek, so the pointer can move on to the next picture.
fn set_peek(app: &AppHandle, target: Option<isize>) -> Result<(), String> {
    let Some(activate) = live_preview() else { return Ok(()) };
    let strip = preview_window(app)?.hwnd().map_err(|e| e.to_string())?;
    let was_peeking = PEEKING.swap(target.is_some(), Ordering::SeqCst);
    if target.is_none() && !was_peeking {
        return Ok(());
    }
    let window = target.map_or(HWND(std::ptr::null_mut()), hwnd_of);
    let result = unsafe { activate(BOOL::from(target.is_some()), window, HWND(strip.0), PEEK_AT_WINDOW, std::ptr::null_mut()) };
    result.ok().map_err(|e| e.to_string())
}

/// A peek fades every other window, and these two have to stay for the pointer to move on.
fn stay_during_peek(window: &WebviewWindow) -> Result<(), String> {
    let raw = window.hwnd().map_err(|e| e.to_string())?;
    let exclude = BOOL::from(true);
    unsafe {
        DwmSetWindowAttribute(HWND(raw.0), DWMWA_EXCLUDED_FROM_PEEK, &exclude as *const BOOL as *const c_void, std::mem::size_of::<BOOL>() as u32)
            .map_err(|e| e.to_string())
    }
}

/// Clicks on the strip mustn't take focus from your app, as with the dock.
/// About as wide as the name in Segoe UI at 12 px, with room either side.
fn name_width(name: &str) -> f64 {
    (name.chars().count() as f64 * 7.2 + 28.0).clamp(NAME_MIN_WIDTH, NAME_MAX_WIDTH)
}

/// The app's name in a bubble above its icon, as Windows shows for an app with no window open, or
/// for any app when previews are turned off. It uses the previews' window, shown with no windows.
/// Sizes the bubble and puts it over a tile. Gives the dock's rectangle and the bubble's.
fn place_bubble(app: &AppHandle, window: &tauri::WebviewWindow, width: f64, tile_x: f64, tile_width: f64) -> Result<Option<(Rect, Rect)>, String> {
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let run = || -> tauri::Result<Option<(Rect, Rect)>> {
        let Some(m) = dock.primary_monitor()? else { return Ok(None) };
        let scale = m.scale_factor();
        let (pos, size) = (dock.outer_position()?, dock.outer_size()?);
        let tile = Span { x: pos.x + (tile_x * scale).round() as i32, w: (tile_width * scale).round() as i32 };
        let dock_rect = Rect { x: pos.x, y: pos.y, w: size.width as i32, h: size.height as i32 };
        let r = card_rect(
            tile,
            dock_rect,
            Rect { x: m.position().x, y: m.position().y, w: m.size().width as i32, h: m.size().height as i32 },
            ((width * scale).round() as i32, (NAME_HEIGHT * scale).round() as i32),
            (DOCK_GAP * scale).round() as i32,
        );
        window.set_size(PhysicalSize::new(r.w as u32, r.h as u32))?;
        window.set_position(PhysicalPosition::new(r.x, r.y))?;
        Ok(Some((dock_rect, Rect { x: r.x, y: r.y, w: r.w, h: r.h })))
    };
    run().map_err(|e| e.to_string())
}

/// Room for the picture beside a bubble's words.
const HINT_ICON_WIDTH: f64 = 24.0;

/// The bubble above the dock during a drag: what letting go would do. The page takes it down.
#[tauri::command(async)]
pub fn preview_hint(app: AppHandle, what: String, key: Option<String>, tile_x: f64, tile_width: f64) -> Result<(), String> {
    let lang = unsafe { ::windows::Win32::Globalization::GetUserDefaultUILanguage() };
    let name = match &key {
        Some(key) if what == "open" => crate::apps::every_entry()?.into_iter().find(|e| e.key == *key).map(|e| e.name).unwrap_or_default(),
        _ => String::new(),
    };
    let text = super::menu::hint_text(&what, lang, &name).ok_or("unknown bubble")?;
    let window = preview_window(&app)?;
    let picture = if key.is_some() { HINT_ICON_WIDTH } else { 0.0 };
    if place_bubble(&app, &window, name_width(&text) + picture, tile_x, tile_width)?.is_none() {
        return Ok(());
    }
    *SHOWN.lock().unwrap_or_else(|e| e.into_inner()) = Some(format!("hint:{what}"));
    let shown = Shown { key: key.unwrap_or_default(), name: text, slot_width: 0.0, windows: Vec::new(), hint: true };
    app.emit_to("preview", "preview-show", shown).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn preview_name(app: AppHandle, key: String, tile_x: f64, tile_width: f64) -> Result<(), String> {
    let opening = HOVER.keep();
    if !may_show(crate::shell::card::is_open()) {
        return Ok(());
    }
    let shown_as = format!("name:{key}");
    if SHOWN.lock().unwrap_or_else(|e| e.into_inner()).as_deref() == Some(shown_as.as_str()) {
        return Ok(());
    }
    let Some(entry) = current()?.into_iter().find(|e| e.key == key) else {
        return hide(&app);
    };
    let window = preview_window(&app)?;
    let Some((dock_rect, strip)) = place_bubble(&app, &window, name_width(&entry.name), tile_x, tile_width)? else { return Ok(()) };
    if !HOVER.still_leaving(opening) || !may_show(crate::shell::card::is_open()) {
        return Ok(());
    }
    let _ = set_peek(&app, None);
    clear_pictures();
    ON_STRIP.lock().unwrap_or_else(|e| e.into_inner()).clear();
    *SHOWN.lock().unwrap_or_else(|e| e.into_inner()) = Some(shown_as);
    let shown = Shown { key, name: entry.name, slot_width: 0.0, windows: Vec::new(), hint: false };
    app.emit_to("preview", "preview-show", shown).map_err(|e| e.to_string())?;
    crate::diag::note("name shown");
    window.show().map_err(|e| e.to_string())?;
    watch_pointer(app.clone(), dock_rect, strip);
    Ok(())
}

/// Previews open right where an app's menu does, so none show while a menu or card is open, as on
/// Windows. A right-click just as they were being prepared used to put them over the menu.
fn may_show(card_open: bool) -> bool {
    !card_open
}

/// The strip of previews is showing.
pub fn is_showing() -> bool {
    SHOWN.lock().unwrap_or_else(|e| e.into_inner()).is_some()
}

pub fn prepare(app: &AppHandle) -> Result<(), String> {
    let window = preview_window(app)?;
    let raw = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        let style = GetWindowLongPtrW(HWND(raw.0), GWL_EXSTYLE);
        SetWindowLongPtrW(HWND(raw.0), GWL_EXSTYLE, style | WS_EX_NOACTIVATE.0 as isize);
    }
    stay_during_peek(&window)?;
    stay_during_peek(&app.get_webview_window("dock").ok_or("dock window missing")?)
}

/// Tile position is logical px inside the dock window.
#[tauri::command(async)]
pub fn preview_show(app: AppHandle, key: String, tile_x: f64, tile_width: f64) -> Result<(), String> {
    let opening = HOVER.keep();
    if !may_show(crate::shell::card::is_open()) {
        return Ok(());
    }
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
            hint: false,
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
    // The pointer may have moved on while the windows were being listed, or a menu opened.
    if !HOVER.still_leaving(opening) || !may_show(crate::shell::card::is_open()) {
        return Ok(());
    }
    let _ = set_peek(&app, None);
    clear_pictures();
    *ON_STRIP.lock().unwrap_or_else(|e| e.into_inner()) = shown.windows.iter().map(|w| w.hwnd).collect();
    *SHOWN.lock().unwrap_or_else(|e| e.into_inner()) = Some(key);
    app.emit_to("preview", "preview-show", shown).map_err(|e| e.to_string())?;
    crate::diag::note("previews shown");
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
            let reported = DwmQueryThumbnailSourceSize(picture).map_or((0, 0), |s| (s.cx, s.cy));
            let source = source_shape(reported, windows::is_minimized(slot.hwnd), windows::normal_size(slot.hwnd));
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

/// Nothing here lasts: the window goes back when the pointer leaves or the strip closes.
#[tauri::command(async)]
pub fn preview_peek(app: AppHandle, hwnd: Option<isize>, seq: u64) -> Result<(), String> {
    if !is_newest(&LAST_PEEK, seq) {
        return Ok(());
    }
    // Held throughout: closing the strip clears this first, so a peek can't start just after it closed.
    let on_strip = ON_STRIP.lock().unwrap_or_else(|e| e.into_inner());
    if hwnd.is_some_and(|raw| !may_peek(&on_strip, raw)) {
        return Err("not on the strip".into());
    }
    set_peek(&app, hwnd)
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
        if !HOVER.still_leaving(token) {
            return;
        }
        // The page isn't always told when the pointer reaches the strip, but the pointer itself knows.
        let area = *AREA.lock().unwrap_or_else(|e| e.into_inner());
        let heading = !crate::preview::is_on() && area.zip(real_pointer()).is_some_and(|((dock, strip), pointer)| heading_for_strip(pointer, dock, strip));
        if !heading {
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
            ..Default::default()
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
    fn a_minimized_window_keeps_the_shape_it_had_when_open() {
        let tiny = (160, 28);
        assert_eq!(source_shape(tiny, true, (1600, 900)), (1600, 900));
        assert_eq!(source_shape((1200, 800), false, (1600, 900)), (1200, 800));
        assert_eq!(source_shape(tiny, true, (0, 0)), tiny, "no shape known");
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
    fn only_a_window_on_the_strip_can_be_peeked_at() {
        let shown = vec![11, 22];
        assert!(may_peek(&shown, 22));
        assert!(!may_peek(&shown, 33));
    }

    #[test]
    fn requests_arriving_out_of_order_are_dropped() {
        let last = AtomicU64::new(0);
        assert!(is_newest(&last, 2));
        assert!(!is_newest(&last, 1), "a leave overtaken by the next hover must not end the peek");
        assert!(is_newest(&last, 3));
    }

    #[test]
    fn under_a_dock_at_the_top_the_strip_and_the_gap_keep_it_open() {
        let dock = Rect { x: 300, y: 8, w: 1000, h: 70 };
        let strip = Rect { x: 500, y: 88, w: 400, h: 170 };
        assert!(heading_for_strip((600, 150), dock, strip), "on the strip");
        assert!(heading_for_strip((600, 82), dock, strip), "in the gap");
        assert!(!heading_for_strip((600, 40), dock, strip), "back on the dock");
        assert!(!heading_for_strip((600, 300), dock, strip), "past it");
        assert!(pointer_within((600, 150), dock, strip));
        assert!(pointer_within((600, 40), dock, strip));
        assert!(!pointer_within((600, 600), dock, strip));
    }

    #[test]
    fn the_name_bubble_is_as_wide_as_the_name_within_limits() {
        assert!(name_width("Discord") < name_width("Explorateur de fichiers"));
        assert_eq!(name_width(""), NAME_MIN_WIDTH);
        assert_eq!(name_width(&"x".repeat(500)), NAME_MAX_WIDTH);
    }

    #[test]
    fn no_previews_while_a_menu_or_card_is_open() {
        assert!(!may_show(true), "they'd open right where the menu is, over it");
        assert!(may_show(false));
    }

    #[test]
    fn a_slow_trip_from_the_icon_to_the_strip_isnt_leaving() {
        let dock = Rect { x: 300, y: 1000, w: 1000, h: 70 };
        let strip = Rect { x: 500, y: 820, w: 400, h: 170 };
        assert!(heading_for_strip((600, 900), dock, strip), "on the strip");
        assert!(heading_for_strip((600, 995), dock, strip), "in the gap");
        assert!(!heading_for_strip((600, 1030), dock, strip), "back on the dock, as moving to another tile");
        assert!(!heading_for_strip((100, 100), dock, strip));
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
