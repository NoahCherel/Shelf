//! App wiring: dock placement, the pop-up panel, tray icon and the commands
//! the frontend calls. Windows-specific plumbing lives in `win.rs`.

mod claude_usage;
mod win;

use std::collections::HashMap;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::System;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, RunEvent, State, WebviewWindow,
    WindowEvent,
};

/// The bar is 56 px; the rest is the gap below it.
const DOCK_HEIGHT: f64 = 72.0;
const PANEL_GAP: f64 = 8.0;
/// A click on a chip blurs the panel before the click itself arrives, so a
/// panel hidden this recently was closed by the very click we are handling.
const REOPEN_GUARD: Duration = Duration::from_millis(250);
const CPU_REFRESH_INTERVAL: Duration = Duration::from_secs(1);

static DOCK_HWND: AtomicIsize = AtomicIsize::new(0);

struct PanelState {
    open: Option<String>,
    hidden_at: Instant,
    last_name: Option<String>,
}

impl PanelState {
    fn mark_hidden(&mut self) {
        if let Some(name) = self.open.take() {
            self.last_name = Some(name);
            self.hidden_at = Instant::now();
        }
    }
}

// ---------------------------------------------------------------- commands

#[derive(Serialize)]
struct SysStats {
    cpu: f32,
    mem_used: u64,
    mem_total: u64,
    battery: Option<(u8, bool)>,
}

struct SysMonitor {
    sys: System,
    cpu_refreshed: Instant,
}

#[tauri::command(async)]
fn sys_stats(monitor: State<'_, Mutex<SysMonitor>>) -> SysStats {
    let mut monitor = monitor.lock().unwrap();
    // The dock and panel both poll this. CPU usage is measured between two
    // refreshes, so back-to-back calls would report garbage like 100%.
    if monitor.cpu_refreshed.elapsed() >= CPU_REFRESH_INTERVAL {
        monitor.sys.refresh_cpu_usage();
        monitor.cpu_refreshed = Instant::now();
    }
    monitor.sys.refresh_memory();
    SysStats {
        cpu: monitor.sys.global_cpu_usage(),
        mem_used: monitor.sys.used_memory(),
        mem_total: monitor.sys.total_memory(),
        battery: win::battery(),
    }
}

#[tauri::command(async)]
fn list_windows() -> Vec<win::WinInfo> {
    win::list_windows()
}

#[tauri::command]
fn focus_window(hwnd: isize) {
    win::focus_window(hwnd);
}

#[tauri::command]
async fn media_info() -> Option<win::MediaInfo> {
    tauri::async_runtime::spawn_blocking(win::media_info)
        .await
        .ok()
        .flatten()
}

#[tauri::command]
async fn media_cmd(cmd: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || win::media_cmd(&cmd))
        .await
        .unwrap_or(false)
}

#[derive(Serialize)]
struct HttpResponse {
    status: u16,
    body: String,
}

#[tauri::command]
async fn http_request(
    client: State<'_, reqwest::Client>,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<HttpResponse, String> {
    let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut req = client.request(method, &url);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    if let Some(body) = body {
        req = req.body(body);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let body = res.text().await.map_err(|e| e.to_string())?;
    Ok(HttpResponse { status, body })
}

#[tauri::command]
fn show_panel(
    app: AppHandle,
    state: State<'_, Mutex<PanelState>>,
    name: String,
    x: f64,
) -> Result<(), String> {
    {
        let mut panel = state.lock().unwrap();
        if panel.open.as_deref() == Some(name.as_str()) {
            panel.mark_hidden();
            drop(panel);
            return hide(&app);
        }
        if panel.last_name.as_deref() == Some(name.as_str())
            && panel.hidden_at.elapsed() < REOPEN_GUARD
        {
            return Ok(());
        }
    }
    open_panel(&app, &name, x).map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_panel(app: AppHandle, state: State<'_, Mutex<PanelState>>) -> Result<(), String> {
    state.lock().unwrap().mark_hidden();
    hide(&app)
}

/// Lets the panel page catch up if `open-panel` fired before it had loaded.
#[tauri::command]
fn current_panel(state: State<'_, Mutex<PanelState>>) -> Option<String> {
    state.lock().unwrap().open.clone()
}

/// Fits the window to the bar and centers it. The reserved screen edge stays full
/// width, so maximized windows keep stopping above the bar.
#[tauri::command]
fn set_dock_width(app: AppHandle, width: f64) -> Result<(), String> {
    let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
    let resize = || -> tauri::Result<()> {
        let Some(monitor) = dock.primary_monitor()? else {
            return Ok(());
        };
        let screen = monitor.size().width as i32;
        let target = ((width * dock.scale_factor()?).ceil() as i32).clamp(1, screen);
        let (height, top) = (dock.outer_size()?.height, dock.outer_position()?.y);
        dock.set_size(PhysicalSize::new(target as u32, height))?;
        dock.set_position(PhysicalPosition::new(monitor.position().x + (screen - target) / 2, top))
    };
    resize().map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn claude_usage() -> serde_json::Value {
    claude_usage::read_usage()
}

#[tauri::command(async)]
fn claude_connect(on: bool) -> Result<(), String> {
    claude_usage::set_connected(on)
}

#[tauri::command]
fn launch_app(exe: String) -> Result<(), String> {
    let path = std::path::Path::new(&exe);
    let mut command = std::process::Command::new(path);
    if let Some(dir) = path.parent() {
        command.current_dir(dir);
    }
    command.spawn().map(drop).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_start() {
    win::open_start();
}

#[tauri::command]
fn open_url(url: String) {
    win::open_url(&url);
}

#[tauri::command]
fn set_autostart(on: bool) -> bool {
    win::set_autostart(on)
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

// ------------------------------------------------------------------- panel

fn hide(app: &AppHandle) -> Result<(), String> {
    match app.get_webview_window("panel") {
        Some(panel) => panel.hide().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// Shows the panel above the dock, centered on `x` (logical px in the dock)
/// and clamped to the dock's width.
fn open_panel(app: &AppHandle, name: &str, x: f64) -> tauri::Result<()> {
    let (Some(dock), Some(panel)) = (
        app.get_webview_window("dock"),
        app.get_webview_window("panel"),
    ) else {
        return Ok(());
    };
    let scale = dock.scale_factor()?;
    let dock_pos = dock.outer_position()?;
    let dock_size = dock.outer_size()?;
    let size = panel.outer_size()?;
    let gap = (PANEL_GAP * scale).round() as i32;

    let center = dock_pos.x + ((x * scale).round() as i32).clamp(0, dock_size.width as i32);
    let mut left = center - size.width as i32 / 2;
    if let Some(monitor) = dock.primary_monitor()? {
        let min_x = monitor.position().x + gap;
        let max_x = (monitor.position().x + monitor.size().width as i32 - size.width as i32 - gap).max(min_x);
        left = left.clamp(min_x, max_x);
    }
    let top = dock_pos.y - size.height as i32 - gap;
    panel.set_position(PhysicalPosition::new(left, top))?;

    app.state::<Mutex<PanelState>>().lock().unwrap().open = Some(name.to_string());
    app.emit_to("panel", "open-panel", name)?;
    panel.show()?;
    panel.set_focus()
}

// -------------------------------------------------------------------- dock

/// Reserves the bottom edge of the primary monitor and moves the dock there.
fn place_dock(dock: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let monitor = dock.primary_monitor()?.ok_or("no primary monitor")?;
    let (pos, size) = (monitor.position(), monitor.size());
    let height = (DOCK_HEIGHT * monitor.scale_factor()).round() as i32;
    let bottom = pos.y + size.height as i32;

    win::hide_taskbar();

    let raw = dock.hwnd()?.0 as isize;
    DOCK_HWND.store(raw, Ordering::Relaxed);
    let (left, top, right, bottom) = win::register_appbar(
        raw,
        (pos.x, bottom - height, pos.x + size.width as i32, bottom),
    );
    dock.set_position(PhysicalPosition::new(left, top))?;
    dock.set_size(PhysicalSize::new((right - left) as u32, (bottom - top) as u32))?;
    dock.show()?;
    Ok(())
}

/// Gets the dock out of the way while a game or video is fullscreen.
fn watch_fullscreen(app: AppHandle) {
    std::thread::spawn(move || {
        let mut hidden = false;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            win::keep_taskbar_hidden();
            let fullscreen = win::foreground_is_fullscreen();
            if fullscreen == hidden {
                continue;
            }
            if let Some(dock) = app.get_webview_window("dock") {
                let result = if fullscreen { dock.hide() } else { dock.show() };
                if result.is_ok() {
                    hidden = fullscreen;
                }
            }
        }
    });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Shelf", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings, &quit])?;

    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Shelf")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => {
                // Past the right edge: open_panel clamps it to the corner.
                let _ = open_panel(app, "settings", 1e6);
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

// --------------------------------------------------------------------- run

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    if claude_usage::is_statusline_call(&args) {
        std::process::exit(claude_usage::run_statusline(&args));
    }
    if std::env::args().any(|a| a == "--restore-taskbar") {
        win::restore_taskbar();
        return;
    }

    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        win::restore_taskbar();
        default_hook(info);
    }));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Shelf-dock")
        .build()
        .expect("failed to build HTTP client");

    let app = tauri::Builder::default()
        .manage(Mutex::new(SysMonitor {
            sys: System::new(),
            cpu_refreshed: Instant::now(),
        }))
        .manage(Mutex::new(PanelState {
            open: None,
            hidden_at: Instant::now(),
            last_name: None,
        }))
        .manage(client)
        .invoke_handler(tauri::generate_handler![
            sys_stats,
            list_windows,
            focus_window,
            media_info,
            media_cmd,
            http_request,
            show_panel,
            hide_panel,
            current_panel,
            set_dock_width,
            claude_usage,
            claude_connect,
            launch_app,
            open_start,
            open_url,
            set_autostart,
            quit,
        ])
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(false) if window.label() == "panel" => {
                window
                    .state::<Mutex<PanelState>>()
                    .lock()
                    .unwrap()
                    .mark_hidden();
                let _ = window.hide();
            }
            // Alt+F4 must not take the dock down with the taskbar still hidden.
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if window.label() == "panel" {
                    window
                        .state::<Mutex<PanelState>>()
                        .lock()
                        .unwrap()
                        .mark_hidden();
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .setup(|app| {
            let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
            place_dock(&dock)?;
            build_tray(app.handle())?;
            watch_fullscreen(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Shelf");

    app.run(|_, event| {
        if let RunEvent::Exit = event {
            let raw = DOCK_HWND.load(Ordering::Relaxed);
            if raw != 0 {
                win::unregister_appbar(raw);
            }
            win::restore_taskbar();
        }
    });
}
