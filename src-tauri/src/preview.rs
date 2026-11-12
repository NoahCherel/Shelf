//! `shelf.exe --preview`: the real app running beside the owner's, for checking changes.
//! It has its own data and locks, leaves the taskbar and screen edge alone, and refuses to
//! change anything on the machine.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

static ON: AtomicBool = AtomicBool::new(false);

pub struct Startup {
    pub touch_taskbar: bool,
    pub reserve_edge: bool,
    pub watchdog: bool,
    pub mutex: &'static str,
    pub quit_event: &'static str,
    pub data_folder: &'static str,
    pub webview_folder: Option<&'static str>,
}

pub fn startup(on: bool) -> Startup {
    if on {
        Startup {
            touch_taskbar: false,
            reserve_edge: false,
            watchdog: false,
            mutex: "dev.personal.shelf.preview.instance",
            quit_event: "dev.personal.shelf.preview.quit",
            data_folder: "Shelf-preview",
            webview_folder: Some("Shelf-preview"),
        }
    } else {
        Startup {
            touch_taskbar: true,
            reserve_edge: true,
            watchdog: true,
            mutex: "dev.personal.shelf.instance",
            quit_event: "dev.personal.shelf.quit",
            data_folder: "Shelf",
            webview_folder: None,
        }
    }
}

pub fn current() -> Startup {
    startup(ON.load(Ordering::Relaxed))
}

fn guard_for(on: bool) -> Result<(), String> {
    if on {
        Err("preview".to_string())
    } else {
        Ok(())
    }
}

/// For commands that change something on the machine.
pub fn is_on() -> bool {
    !current().touch_taskbar
}

pub fn guard() -> Result<(), String> {
    guard_for(ON.load(Ordering::Relaxed))
}

/// The taskbar's restore always shows its windows, which in preview would bring the taskbar
/// back over the owner's own Shelf.
fn restore_taskbar_if_ours(on: bool, restore: impl FnOnce()) {
    if !on {
        restore();
    }
}

pub fn restore_taskbar(restore: impl FnOnce()) {
    restore_taskbar_if_ours(ON.load(Ordering::Relaxed), restore);
}

/// Pictures should show what the owner sees. Keys and cached account data stay behind.
fn seed(real: &Path, copy: &Path, clean: bool) {
    let _ = std::fs::create_dir_all(copy);
    for name in ["layout.json", "settings.json"] {
        if clean {
            let _ = std::fs::remove_file(copy.join(name));
        } else {
            let _ = std::fs::copy(real.join(name), copy.join(name));
        }
    }
}

/// Call first. Separates this process from the owner's Shelf before anything starts.
pub fn turn_on() {
    ON.store(true, Ordering::Relaxed);
    let settings = current();
    if let Ok(appdata) = std::env::var("APPDATA") {
        let appdata = Path::new(&appdata);
        // The end-to-end checks need the default layout, and this way they leave the owner's Shelf running.
        let clean = std::env::var_os("SHELF_PREVIEW_CLEAN").is_some();
        seed(&appdata.join("Shelf").join("data"), &appdata.join(settings.data_folder).join("data"), clean);
    }
    // WebView2 refuses a second instance on one folder with different arguments, like a debug port.
    if let (Some(folder), Ok(local)) = (settings.webview_folder, std::env::var("LOCALAPPDATA")) {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", Path::new(&local).join(folder).join("webview"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("shelf-preview-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn preview_leaves_the_taskbar_and_screen_edge_alone() {
        let s = startup(true);
        assert!(!s.touch_taskbar);
        assert!(!s.reserve_edge);
        assert!(!s.watchdog);
    }

    #[test]
    fn preview_has_its_own_lock_quit_event_and_data_folder() {
        let (normal, preview) = (startup(false), startup(true));
        assert_ne!(normal.mutex, preview.mutex);
        assert_ne!(normal.quit_event, preview.quit_event);
        assert_ne!(normal.data_folder, preview.data_folder);
    }

    #[test]
    fn normal_startup_is_unchanged() {
        let s = startup(false);
        assert!(s.touch_taskbar && s.reserve_edge && s.watchdog);
        assert_eq!(s.data_folder, "Shelf");
        assert_eq!(s.webview_folder, None);
    }

    #[test]
    fn guard_refuses_only_in_preview() {
        assert_eq!(guard_for(true), Err("preview".to_string()));
        assert_eq!(guard_for(false), Ok(()));
    }

    #[test]
    fn preview_has_its_own_webview_folder() {
        assert!(startup(true).webview_folder.is_some());
    }

    #[test]
    fn quitting_or_crashing_in_preview_never_touches_the_taskbar() {
        let restored = Cell::new(0);
        restore_taskbar_if_ours(true, || restored.set(restored.get() + 1));
        assert_eq!(restored.get(), 0);
        restore_taskbar_if_ours(false, || restored.set(restored.get() + 1));
        assert_eq!(restored.get(), 1);
    }

    #[test]
    fn preview_starts_from_a_copy_of_the_owners_layout_and_settings() {
        let (real, copy) = (temp_dir("real"), temp_dir("copy"));
        std::fs::create_dir_all(&real).unwrap();
        std::fs::write(real.join("layout.json"), "L").unwrap();
        std::fs::write(real.join("settings.json"), "S").unwrap();
        std::fs::write(real.join("cache-stripe.json"), "secret-ish").unwrap();
        seed(&real, &copy, false);
        assert_eq!(std::fs::read_to_string(copy.join("layout.json")).unwrap(), "L");
        assert_eq!(std::fs::read_to_string(copy.join("settings.json")).unwrap(), "S");
        assert!(!copy.join("cache-stripe.json").exists(), "only those two");
    }

    #[test]
    fn seeding_with_nothing_saved_is_fine() {
        seed(&temp_dir("none"), &temp_dir("none-copy"), false);
    }

    #[test]
    fn a_clean_preview_starts_from_the_defaults_and_leaves_the_real_data_alone() {
        let (real, copy) = (temp_dir("clean-real"), temp_dir("clean-copy"));
        std::fs::create_dir_all(&real).unwrap();
        std::fs::create_dir_all(&copy).unwrap();
        std::fs::write(real.join("layout.json"), "real").unwrap();
        std::fs::write(copy.join("layout.json"), "old").unwrap();
        seed(&real, &copy, true);
        assert!(!copy.join("layout.json").exists());
        assert_eq!(std::fs::read_to_string(real.join("layout.json")).unwrap(), "real");
    }

    /// One guard per command that changes the machine, read from the source so a new
    /// route around it shows up here.
    #[test]
    fn every_command_that_changes_the_machine_is_guarded() {
        let sources = [
            (include_str!("shell/taskbar.rs"), "set_taskbar_mode"),
            (include_str!("system/mod.rs"), "autostart_set"),
            (include_str!("lib.rs"), "claude_connect"),
            (include_str!("apps/mod.rs"), "apps_activate"),
            (include_str!("apps/mod.rs"), "apps_menu_choose"),
            (include_str!("apps/mod.rs"), "start_menu"),
            (include_str!("apps/mod.rs"), "start_quick_menu"),
            (include_str!("system/tray.rs"), "tray_toggle"),
            (include_str!("system/notifications.rs"), "notification_dismiss"),
            (include_str!("system/notifications.rs"), "notifications_clear"),
            (include_str!("system/notifications.rs"), "notification_open"),
            (include_str!("search/mod.rs"), "search_forget_file"),
            (include_str!("system/audio.rs"), "audio_set_volume"),
            (include_str!("system/audio.rs"), "audio_set_mute"),
            (include_str!("system/audio.rs"), "audio_set_app_volume"),
            (include_str!("system/audio.rs"), "audio_set_output"),
            (include_str!("system/settings_link.rs"), "open_settings"),
            (include_str!("apps/previews.rs"), "preview_activate"),
            (include_str!("apps/previews.rs"), "preview_close_window"),
            (include_str!("search/mod.rs"), "search_open"),
            (include_str!("search/mod.rs"), "search_web"),
            (include_str!("system/toggles.rs"), "toggle_set"),
            (include_str!("system/radios.rs"), "radio_set"),
            (include_str!("system/brightness.rs"), "brightness_set"),
            (include_str!("system/wifi.rs"), "wifi_connect"),
            (include_str!("system/wifi.rs"), "wifi_disconnect"),
        ];
        for (source, name) in sources {
            let at = source.find(&format!("fn {name}(")).unwrap_or_else(|| panic!("no fn {name}"));
            let head: String = source[at..].lines().take(3).collect();
            assert!(head.contains("preview::guard()?"), "{name} isn't guarded");
        }
    }
}
