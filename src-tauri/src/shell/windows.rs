//! Windows made on demand and destroyed on close, so they cost nothing when closed.

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use super::dock::Rect;

/// Position first, then size. Moved onto a screen of another scale, Windows rescales the window as it
/// arrives, so a size set before the move would be scaled a second time.
pub fn put(window: &WebviewWindow, r: Rect) -> tauri::Result<()> {
    window.set_position(PhysicalPosition::new(r.x, r.y))?;
    window.set_size(PhysicalSize::new(r.w as u32, r.h as u32))
}

/// Must match every window in tauri.conf.json: windows with different options can't share WebView2.
/// One renderer between them keeps memory down, as they only ever show Shelf's own pages.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,SpareRendererForSitePerProcess --disable-background-timer-throttling --disable-renderer-backgrounding --renderer-process-limit=1";

fn size_of(kind: &str) -> Option<(f64, f64, &'static str)> {
    match kind {
        "picker" => Some((980.0, 660.0, "Shelf widgets")),
        "settings" => Some((760.0, 560.0, "Shelf settings")),
        _ => None,
    }
}

/// Async on purpose: making a window in a synchronous command deadlocks WebView2 on Windows.
#[tauri::command(async)]
pub fn open_window(app: AppHandle, kind: String) -> Result<(), String> {
    let (width, height, title) = size_of(&kind).ok_or("unknown window")?;
    if let Some(window) = app.get_webview_window(&kind) {
        return window.set_focus().map_err(|e| e.to_string());
    }
    let url = WebviewUrl::App(format!("index.html?w={kind}").into());
    WebviewWindowBuilder::new(&app, &kind, url)
        .title(title)
        .inner_size(width, height)
        .center()
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .additional_browser_args(BROWSER_ARGS)
        .build()
        .map_err(|e| e.to_string())?;
    if kind == "picker" {
        let _ = app.emit("picker-open", true);
    }
    Ok(())
}

#[tauri::command(async)]
pub fn close_window(app: AppHandle, kind: String) -> Result<(), String> {
    match app.get_webview_window(&kind) {
        Some(window) => window.destroy().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// However the window went, the dock has to stop showing its badges.
pub fn on_destroyed(window: &tauri::Window) {
    if window.label() == "picker" {
        let _ = window.emit("picker-open", false);
    }
}

#[cfg(test)]
mod browser_args_tests {
    use super::BROWSER_ARGS;

    #[test]
    fn every_window_shares_the_same_browser_options() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        let windows = conf["app"]["windows"].as_array().unwrap();
        assert!(!windows.is_empty());
        for window in windows {
            assert_eq!(window["additionalBrowserArgs"], BROWSER_ARGS, "{}", window["label"]);
        }
    }
}
