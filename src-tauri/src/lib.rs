//! App wiring. Everything Windows-specific lives in its own module.

mod apps;
mod claude_usage;
mod net;
mod secrets;
mod shell;
mod store;
mod system;

use std::sync::atomic::{AtomicIsize, Ordering};
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, RunEvent, WebviewWindow, WindowEvent};

use shell::events;
use shell::taskbar::{Mode, TASKBAR};

/// The bar is 55 px; the rest is the gap below it.
const DOCK_HEIGHT: f64 = 72.0;

static DOCK_HWND: AtomicIsize = AtomicIsize::new(0);

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
fn quit(app: AppHandle) {
    app.exit(0);
}

/// The mode saved in Settings; Hidden when nothing valid is saved.
fn saved_taskbar_mode() -> Mode {
    let settings = store::load("settings");
    match settings.as_ref().and_then(|s| s["taskbarMode"].as_str()) {
        Some("autohide") => Mode::Autohide,
        _ => Mode::Hidden,
    }
}

/// Reserves the bottom edge of the primary monitor and moves the dock there.
fn place_dock(dock: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let monitor = dock.primary_monitor()?.ok_or("no primary monitor")?;
    let (pos, size) = (monitor.position(), monitor.size());
    let height = (DOCK_HEIGHT * monitor.scale_factor()).round() as i32;
    let bottom = pos.y + size.height as i32;

    TASKBAR.apply(saved_taskbar_mode());

    let raw = dock.hwnd()?.0 as isize;
    DOCK_HWND.store(raw, Ordering::Relaxed);
    let (left, top, right, bottom) =
        shell::appbar::register(raw, (pos.x, bottom - height, pos.x + size.width as i32, bottom));
    dock.set_position(PhysicalPosition::new(left, top))?;
    dock.set_size(PhysicalSize::new((right - left) as u32, (bottom - top) as u32))?;
    dock.show()?;
    Ok(())
}

/// Gets the dock out of the way while a game or video is fullscreen.
fn watch_shell(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        TASKBAR.keep();
        let fullscreen = events::foreground_is_fullscreen();
        if fullscreen == events::FULLSCREEN.load(Ordering::Relaxed) {
            continue;
        }
        if let Some(dock) = app.get_webview_window("dock") {
            let result = if fullscreen { dock.hide() } else { dock.show() };
            if result.is_ok() {
                events::FULLSCREEN.store(fullscreen, Ordering::Relaxed);
            }
        }
    });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let quit = MenuItem::with_id(app, "quit", "Quit Shelf", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit])?;
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Shelf")
        .on_menu_event(|app, event| {
            if event.id.as_ref() == "quit" {
                app.exit(0);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Starts the companion that restores the taskbar if this process is killed.
fn spawn_taskbar_watch() {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::process::Command::new(exe)
            .args(["--watch-taskbar", &std::process::id().to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
}

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    // First: Claude Code calls this for every status line refresh, so it must stay cheap.
    if claude_usage::is_statusline_call(&args) {
        std::process::exit(claude_usage::run_statusline(&args));
    }
    if args.iter().any(|a| a == "--restore-taskbar") {
        TASKBAR.restore();
        return;
    }
    if let Some(i) = args.iter().position(|a| a == "--watch-taskbar") {
        if let Some(pid) = args.get(i + 1).and_then(|p| p.parse().ok()) {
            shell::taskbar::watch_parent(pid);
        }
        return;
    }
    if shell::already_running() {
        return;
    }

    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        TASKBAR.restore();
        default_hook(info);
    }));
    spawn_taskbar_watch();

    let app = tauri::Builder::default()
        .manage(system::SysMonitor::new())
        .manage(net::client())
        .invoke_handler(tauri::generate_handler![
            store::store_load,
            store::store_save,
            secrets::secret_set,
            secrets::secret_has,
            secrets::secret_delete,
            net::http_get,
            events::shell_status,
            shell::taskbar::set_taskbar_mode,
            system::system_stats,
            system::autostart_get,
            system::autostart_set,
            system::open_url,
            apps::list_windows,
            apps::focus_window,
            apps::open_start,
            set_dock_width,
            claude_usage,
            claude_connect,
            quit,
        ])
        .on_window_event(|window, event| {
            // Alt+F4 must not take the dock down with the taskbar still hidden.
            if let (WindowEvent::CloseRequested { api, .. }, "dock") = (event, window.label()) {
                api.prevent_close();
            }
        })
        .setup(|app| {
            let dock = app.get_webview_window("dock").ok_or("dock window missing")?;
            place_dock(&dock)?;
            build_tray(app.handle())?;
            watch_shell(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Shelf");

    app.run(|_, event| {
        if let RunEvent::Exit = event {
            let raw = DOCK_HWND.load(Ordering::Relaxed);
            if raw != 0 {
                shell::appbar::unregister(raw);
            }
            TASKBAR.restore();
        }
    });
}
