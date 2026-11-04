//! Windows made on demand and destroyed on close, so they cost nothing when closed.

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Must match the configured windows, or WebView2 refuses to share one renderer.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-background-timer-throttling --disable-renderer-backgrounding";

fn size_of(kind: &str) -> Option<(f64, f64, &'static str)> {
    match kind {
        "picker" => Some((980.0, 660.0, "Shelf widgets")),
        "settings" => Some((760.0, 560.0, "Shelf settings")),
        _ => None,
    }
}

#[tauri::command]
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

#[tauri::command]
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
