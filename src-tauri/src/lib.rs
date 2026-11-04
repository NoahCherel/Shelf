//! App wiring. Everything Windows-specific lives in its own module.

mod apps;
mod claude_usage;
mod net;
mod secrets;
mod shell;
mod store;
mod system;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, RunEvent, WindowEvent};

use shell::events;
use shell::taskbar::TASKBAR;

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
            shell::dock::set_dock_width,
            shell::taskbar::set_taskbar_mode,
            system::system_stats,
            system::autostart_get,
            system::autostart_set,
            system::open_url,
            apps::list_windows,
            apps::focus_window,
            apps::open_start,
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
            shell::dock::start(app.handle())?;
            build_tray(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Shelf");

    app.run(|_, event| {
        if let RunEvent::Exit = event {
            shell::dock::stop();
        }
    });
}
