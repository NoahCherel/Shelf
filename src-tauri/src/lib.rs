//! App wiring. Everything Windows-specific lives in its own module.

mod apps;
mod claude_usage;
mod diag;
mod glass;
mod net;
mod preview;
mod search;
mod secrets;
mod shell;
mod store;
mod system;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, DragDropEvent, Manager, RunEvent, WindowEvent};

use shell::events;
use shell::taskbar::TASKBAR;

#[tauri::command(async)]
fn claude_usage() -> serde_json::Value {
    claude_usage::read_usage()
}

#[tauri::command(async)]
fn claude_connect(on: bool) -> Result<(), String> {
    preview::guard()?;
    claude_usage::set_connected(on)
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let widgets = MenuItem::with_id(app, "picker", "Widgets…", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Shelf", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&widgets, &settings, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Shelf")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            kind => {
                // Off this thread: making a window in a menu handler deadlocks WebView2 on Windows.
                let (app, kind) = (app.clone(), kind.to_string());
                std::thread::spawn(move || {
                    let _ = shell::windows::open_window(app, kind);
                });
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
    if args.iter().any(|a| a == "--preview") {
        preview::turn_on();
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
    if args.iter().any(|a| a == "--quit") {
        shell::ask_to_quit();
        return;
    }
    if shell::already_running() {
        return;
    }

    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        preview::restore_taskbar(|| TASKBAR.restore());
        default_hook(info);
    }));
    if preview::current().watchdog {
        spawn_taskbar_watch();
    }

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
            shell::dock::dock_drag,
            shell::dock::dock_drag_end,
            shell::dock::set_dock_behaviour,
            shell::card::open_card,
            shell::card::fit_card,
            shell::card::card_current,
            shell::card::close_card,
            shell::card::swap_card,
            shell::card::card_room,
            system::settings_link::open_settings,
            shell::windows::open_window,
            shell::windows::close_window,
            shell::taskbar::set_taskbar_mode,
            glass::glass_start,
            glass::glass_stop,
            glass::glass_frame,
            system::system_stats,
            system::status::system_status,
            system::tray::tray_toggle,
            system::notifications::notifications_list,
            system::notifications::notification_dismiss,
            system::notifications::notifications_clear,
            system::notifications::notification_open,
            apps::previews::preview_show,
            apps::previews::preview_name,
            apps::previews::preview_slots,
            apps::previews::preview_peek,
            apps::previews::preview_keep,
            apps::previews::preview_leave,
            apps::previews::preview_hide,
            apps::previews::preview_activate,
            apps::previews::preview_close_window,
            search::search_apps,
            search::search_files,
            search::search_recent_files,
            search::search_forget_file,
            search::search_open,
            search::search_web,
            search::search_icon,
            system::toggles::toggles_state,
            system::toggles::toggle_set,
            system::bluetooth::bluetooth_devices,
            system::radios::radios_state,
            system::radios::radio_set,
            system::brightness::brightness_get,
            system::brightness::brightness_set,
            system::wifi::wifi_networks,
            system::wifi::wifi_scan,
            system::wifi::wifi_connect,
            system::wifi::wifi_disconnect,
            system::audio::audio_state,
            system::audio::audio_set_volume,
            system::audio::audio_set_mute,
            system::audio::audio_set_app_volume,
            system::audio::audio_set_output,
            system::audio::audio_app_icon,
            system::autostart_get,
            system::autostart_set,
            apps::apps_list,
            apps::apps_icon,
            apps::apps_activate,
            apps::start_menu,
            apps::start_quick_menu,
            apps::apps_menu,
            apps::apps_menu_choose,
            apps::apps_menu_icons,
            apps::apps_reorder,
            apps::apps_unpin,
            apps::apps_group,
            apps::apps_group_rename,
            apps::apps_stack,
            apps::apps_stack_icons,
            apps::apps_stack_open,
            apps::apps_drag_target,
            apps::apps_drag_raise,
            claude_usage,
            claude_connect,
            diag::diag_note,
            quit,
        ])
        .on_window_event(|window, event| match (event, window.label()) {
            // Alt+F4 must not take the dock down with the taskbar still hidden.
            (WindowEvent::CloseRequested { api, .. }, "dock" | "preview") => api.prevent_close(),
            (WindowEvent::CloseRequested { api, .. }, "card") => {
                api.prevent_close();
                shell::card::on_close(window);
            }
            (WindowEvent::Focused(false), "card") => shell::card::on_blur(window),
            // Something dragged from Windows over the dock holds it up while auto-hide is on.
            (WindowEvent::DragDrop(DragDropEvent::Enter { position, .. } | DragDropEvent::Over { position }), "dock") => {
                if matches!(event, WindowEvent::DragDrop(DragDropEvent::Enter { .. })) {
                    diag::note("drag from Windows entered the dock");
                }
                shell::dock::os_drag(true);
                let _ = tauri::Emitter::emit(window, "os-drag", Some((position.x, position.y)));
            }
            (WindowEvent::DragDrop(DragDropEvent::Leave), "dock") => {
                diag::note("drag from Windows left the dock");
                shell::dock::os_drag(false);
                let _ = tauri::Emitter::emit(window, "os-drag", None::<(f64, f64)>);
            }
            (WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }), "dock") => {
                diag::note(&format!("{} dropped on the dock", paths.len()));
                shell::dock::os_drag(false);
                apps::pin_dropped(window.app_handle().clone(), paths.clone());
                let _ = tauri::Emitter::emit(window, "os-drag", None::<(f64, f64)>);
            }
            (WindowEvent::Destroyed, _) => shell::windows::on_destroyed(window),
            _ => {}
        })
        .setup(|app| {
            diag::remember(app.handle());
            search::refresh_apps();
            apps::previews::prepare(app.handle())?;
            shell::dock::start(app.handle())?;
            apps::watch_foreground(app.handle());
            build_tray(app.handle())?;
            shell::listen_for_quit(app.handle().clone());
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
