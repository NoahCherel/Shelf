//! The apps pinned to the Windows taskbar, read from their shortcuts.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use windows::core::{Interface, HSTRING};
use windows::Win32::System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

use serde::{Deserialize, Serialize};

use super::merge::{keep_pin, AppEntry, Pin};
use super::windows::{store_string, APP_ID_KEY};

/// Pins made from the dock's own menu. Windows has no public way to pin to its taskbar, and it's
/// hidden anyway, so these sit on top of its list and leave it untouched.
pub const OVERLAY: &str = "dock-pins";
/// How many apps' places are remembered. Apps that come and go would otherwise grow it forever.
pub const ORDER_LIMIT: usize = 200;

#[derive(Serialize, Deserialize, Default, Debug)]
struct AddedPin {
    key: String,
    name: String,
    source: String,
}

#[derive(Serialize, Deserialize, Default, Debug)]
pub struct Overlay {
    #[serde(default)]
    added: Vec<AddedPin>,
    #[serde(default)]
    removed: Vec<String>,
    /// The dock's order, as last arranged by dragging. Apps not in it go after.
    #[serde(default)]
    order: Vec<String>,
}

#[derive(PartialEq, Debug)]
pub enum Dropped {
    Program,
    Shortcut,
    Folder,
    File,
}

fn file_stem(path: &str) -> &str {
    let file = path.rsplit(['\\', '/']).next().unwrap_or(path);
    file.rsplit_once('.').map_or(file, |(stem, _)| stem)
}

/// What a path dropped on the dock is. Only programs and shortcuts become pinned apps.
pub fn dropped(path: &str, is_dir: impl Fn(&str) -> bool) -> Dropped {
    let lower = path.to_lowercase();
    if lower.ends_with(".exe") {
        Dropped::Program
    } else if lower.ends_with(".lnk") {
        Dropped::Shortcut
    } else if is_dir(path) {
        Dropped::Folder
    } else {
        Dropped::File
    }
}

/// The saved order first, then everything it doesn't know, as it came.
pub fn arrange(mut entries: Vec<AppEntry>, order: &[String]) -> Vec<AppEntry> {
    let place = |key: &str| order.iter().position(|k| k == key).unwrap_or(usize::MAX);
    // A stable sort keeps the unknown ones in their own order.
    entries.sort_by_key(|e| place(&e.key));
    entries
}

fn is_path(key: &str) -> bool {
    key.contains('\\') || key.contains('/')
}

fn key_of(pin: &Pin) -> String {
    pin.app_id.as_ref().or(pin.target.as_ref()).unwrap_or(&pin.link).to_lowercase()
}

impl Overlay {
    fn from_saved(saved: Option<serde_json::Value>) -> Overlay {
        saved.and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
    }

    fn pin(&mut self, entry: &AppEntry) {
        if let Some(hidden) = self.removed.iter().position(|k| *k == entry.key) {
            self.removed.remove(hidden);
            return;
        }
        if !self.added.iter().any(|a| a.key == entry.key) {
            let source = entry.icon_source.clone().or(entry.launch.clone()).unwrap_or_else(|| entry.key.clone());
            self.added.push(AddedPin { key: entry.key.clone(), name: entry.name.clone(), source });
        }
    }

    fn set_order(&mut self, keys: Vec<String>) {
        let mut seen = std::collections::HashSet::new();
        self.order = keys.into_iter().filter(|k| seen.insert(k.clone())).take(ORDER_LIMIT).collect();
    }

    /// A program, or a shortcut to one, dropped on the dock. `opens` is what a shortcut points to.
    fn pin_program(&mut self, path: &str, opens: Option<&str>) {
        let key = opens.unwrap_or(path).to_lowercase();
        if let Some(hidden) = self.removed.iter().position(|k| *k == key) {
            self.removed.remove(hidden);
        }
        if !self.added.iter().any(|a| a.key == key) {
            self.added.push(AddedPin { key, name: file_stem(path).to_string(), source: path.to_string() });
        }
    }

    fn unpin(&mut self, key: &str) {
        let before = self.added.len();
        self.added.retain(|a| a.key != key);
        if self.added.len() == before {
            self.removed.push(key.to_string());
        }
    }
}

fn apply(windows_pins: Vec<Pin>, overlay: &Overlay, exists: impl Fn(&str) -> bool) -> Vec<Pin> {
    let mut pins: Vec<Pin> = windows_pins.into_iter().filter(|p| !overlay.removed.contains(&key_of(p))).collect();
    for added in &overlay.added {
        let path = is_path(&added.key) || added.source.eq_ignore_ascii_case(&added.key);
        let pin = Pin {
            name: added.name.clone(),
            link: added.source.clone(),
            target: path.then(|| added.source.clone()),
            app_id: (!path).then(|| added.key.clone()),
        };
        if keep_pin(&pin, &exists) && !pins.iter().any(|p| key_of(p) == added.key) {
            pins.push(pin);
        }
    }
    pins
}

pub fn with_overlay(windows_pins: Vec<Pin>) -> Vec<Pin> {
    apply(windows_pins, &Overlay::from_saved(crate::store::load(OVERLAY)), |target| Path::new(target).exists())
}

fn changed(change: impl FnOnce(&mut Overlay)) -> serde_json::Value {
    let mut overlay = Overlay::from_saved(crate::store::load(OVERLAY));
    change(&mut overlay);
    serde_json::to_value(overlay).unwrap_or_default()
}

/// What to save after pinning.
pub fn pin(entry: &AppEntry) -> serde_json::Value {
    changed(|o| o.pin(entry))
}

/// What to save after unpinning.
pub fn unpin(key: &str) -> serde_json::Value {
    changed(|o| o.unpin(key))
}

/// What to save after the apps were dragged into a new order.
pub fn reordered(keys: Vec<String>) -> serde_json::Value {
    changed(|o| o.set_order(keys))
}

/// The saved order of the dock's apps.
pub fn order() -> Vec<String> {
    Overlay::from_saved(crate::store::load(OVERLAY)).order
}

/// What to save after a program or shortcut was dropped on the dock; None for anything else.
/// Call on a thread with COM initialised, as a shortcut has to be read.
pub fn pin_dropped(path: &str) -> Option<serde_json::Value> {
    let opens = match dropped(path, |p| Path::new(p).is_dir()) {
        Dropped::Program => None,
        Dropped::Shortcut => Some(read_link(Path::new(path))?.target?),
        Dropped::Folder | Dropped::File => return None,
    };
    Some(changed(|o| o.pin_program(path, opens.as_deref())))
}

/// What a shortcut opens. Call on a thread with COM initialised.
pub fn link_target(path: &str) -> Option<String> {
    read_link(Path::new(path))?.target
}

/// Only re-read when the folder changes.
static CACHE: Mutex<Option<(SystemTime, Vec<Pin>)>> = Mutex::new(None);

fn folder() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_default();
    Path::new(&base).join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar")
}

fn read_link(path: &Path) -> Option<Pin> {
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let file: IPersistFile = link.cast().ok()?;
        file.Load(&HSTRING::from(path.as_os_str()), STGM_READ).ok()?;

        let mut buf = [0u16; 1024];
        let target = link
            .GetPath(&mut buf, std::ptr::null_mut(), 0)
            .ok()
            .map(|_| String::from_utf16_lossy(&buf[..buf.iter().position(|&c| c == 0).unwrap_or(0)]))
            .filter(|t| !t.is_empty());
        let app_id = link.cast::<IPropertyStore>().ok().and_then(|s| store_string(&s, &APP_ID_KEY));
        Some(Pin {
            name: path.file_stem()?.to_string_lossy().into_owned(),
            link: path.to_string_lossy().into_owned(),
            target,
            app_id,
        })
    }
}

fn read_all(dir: &Path) -> Vec<Pin> {
    let Ok(files) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut paths: Vec<PathBuf> = files.flatten().map(|f| f.path()).collect();
    paths.retain(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("lnk")));
    paths.sort();
    paths
        .iter()
        .filter_map(|p| read_link(p))
        .filter(|pin| keep_pin(pin, |t| Path::new(t).exists()))
        .collect()
}

/// Call on a thread with COM initialised.
pub fn list() -> Vec<Pin> {
    let dir = folder();
    let stamp = std::fs::metadata(&dir).and_then(|m| m.modified()).unwrap_or(SystemTime::UNIX_EPOCH);
    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    match &*cache {
        Some((when, pins)) if *when == stamp => pins.clone(),
        _ => {
            let pins = read_all(&dir);
            *cache = Some((stamp, pins.clone()));
            pins
        }
    }
}

#[cfg(test)]
mod overlay_tests {
    use super::*;

    fn pin(name: &str, target: &str) -> Pin {
        Pin { name: name.into(), link: format!("{name}.lnk"), target: Some(target.into()), app_id: None }
    }

    fn entry(key: &str, name: &str, source: &str) -> AppEntry {
        AppEntry { key: key.into(), name: name.into(), pinned: false, active: false, windows: Vec::new(), launch: Some(source.into()), icon_source: Some(source.into()) }
    }

    const EXISTS: fn(&str) -> bool = |_| true;

    #[test]
    fn nothing_changed_leaves_windows_pins_alone() {
        let pins = apply(vec![pin("A", "a.exe")], &Overlay::default(), EXISTS);
        assert_eq!(pins.len(), 1);
    }

    #[test]
    fn pinning_adds_it_after_windows_pins() {
        let mut overlay = Overlay::default();
        overlay.pin(&entry(r"c:\b.exe", "B", r"C:\b.exe"));
        let pins = apply(vec![pin("A", "a.exe")], &overlay, EXISTS);
        assert_eq!(pins.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["A", "B"]);
        assert_eq!(pins[1].target.as_deref(), Some(r"C:\b.exe"));
    }

    #[test]
    fn a_store_app_is_pinned_by_its_id() {
        let mut overlay = Overlay::default();
        overlay.pin(&entry("some.app!id", "S", r"shell:AppsFolder\Some.App!Id"));
        let pins = apply(Vec::new(), &overlay, EXISTS);
        assert_eq!(pins[0].app_id.as_deref(), Some("some.app!id"));
        assert_eq!(pins[0].target, None);
        assert_eq!(pins[0].link, r"shell:AppsFolder\Some.App!Id");
    }

    #[test]
    fn unpinning_one_of_windows_pins_hides_it_here_only() {
        let mut overlay = Overlay::default();
        overlay.unpin("a.exe");
        assert!(apply(vec![pin("A", "a.exe")], &overlay, EXISTS).is_empty());
    }

    #[test]
    fn pinning_it_back_undoes_that() {
        let mut overlay = Overlay::default();
        overlay.unpin("a.exe");
        overlay.pin(&entry("a.exe", "A", "a.exe"));
        let pins = apply(vec![pin("A", "a.exe")], &overlay, EXISTS);
        assert_eq!(pins.len(), 1, "back as Windows has it, and not twice");
    }

    #[test]
    fn unpinning_what_was_pinned_here_just_forgets_it() {
        let mut overlay = Overlay::default();
        overlay.pin(&entry(r"c:\b.exe", "B", r"C:\b.exe"));
        overlay.unpin(r"c:\b.exe");
        assert!(apply(Vec::new(), &overlay, EXISTS).is_empty());
        assert!(overlay.removed.is_empty(), "nothing of Windows' to hide");
    }

    #[test]
    fn a_pinned_program_that_was_uninstalled_goes() {
        let mut overlay = Overlay::default();
        overlay.pin(&entry(r"c:\gone.exe", "Gone", r"C:\gone.exe"));
        assert!(apply(Vec::new(), &overlay, |_| false).is_empty());
    }

    fn named(keys: &[&str]) -> Vec<AppEntry> {
        keys.iter().map(|k| entry(k, k, k)).collect()
    }

    fn keys(entries: &[AppEntry]) -> Vec<&str> {
        entries.iter().map(|e| e.key.as_str()).collect()
    }

    #[test]
    fn the_saved_order_is_kept_and_apps_it_doesnt_know_go_after() {
        let order = vec!["c".to_string(), "a".to_string()];
        let arranged = arrange(named(&["a", "b", "c", "d"]), &order);
        assert_eq!(keys(&arranged), ["c", "a", "b", "d"]);
    }

    #[test]
    fn with_no_order_saved_nothing_moves() {
        assert_eq!(keys(&arrange(named(&["a", "b"]), &[])), ["a", "b"]);
    }

    #[test]
    fn an_order_is_saved_without_repeats_and_within_its_limit() {
        let mut overlay = Overlay::default();
        overlay.set_order(vec!["b".into(), "a".into(), "b".into()]);
        assert_eq!(overlay.order, ["b", "a"]);
        overlay.set_order((0..500).map(|i| i.to_string()).collect());
        assert_eq!(overlay.order.len(), ORDER_LIMIT);
    }

    #[test]
    fn a_file_saved_before_there_was_an_order_still_reads() {
        let old = Overlay::from_saved(Some(serde_json::json!({ "added": [], "removed": ["x"] })));
        assert_eq!(old.removed, ["x"]);
        assert!(old.order.is_empty());
    }

    #[test]
    fn what_is_dropped_on_the_dock_is_sorted_by_what_it_is() {
        let dir = |p: &str| p.ends_with("Folder");
        assert_eq!(dropped(r"C:\Apps\tool.EXE", dir), Dropped::Program);
        assert_eq!(dropped(r"C:\Users\me\Desktop\Game.lnk", dir), Dropped::Shortcut);
        assert_eq!(dropped(r"C:\Users\me\Folder", dir), Dropped::Folder);
        assert_eq!(dropped(r"C:\Users\me\notes.txt", dir), Dropped::File);
    }

    #[test]
    fn a_dropped_program_is_pinned_by_its_path_with_its_file_name() {
        let mut overlay = Overlay::default();
        overlay.pin_program(r"C:\Apps\Tool.exe", None);
        let pins = apply(Vec::new(), &overlay, EXISTS);
        assert_eq!(pins[0].name, "Tool");
        assert_eq!(pins[0].target.as_deref(), Some(r"C:\Apps\Tool.exe"));
        overlay.pin_program(r"C:\Apps\Tool.exe", None);
        assert_eq!(overlay.added.len(), 1, "not twice");
    }

    #[test]
    fn a_dropped_shortcut_is_pinned_by_what_it_opens() {
        let mut overlay = Overlay::default();
        overlay.pin_program(r"C:\Users\me\Desktop\Game.lnk", Some(r"D:\Games\game.exe"));
        assert_eq!(overlay.added[0].key, r"d:\games\game.exe");
        assert_eq!(overlay.added[0].name, "Game");
        assert_eq!(overlay.added[0].source, r"C:\Users\me\Desktop\Game.lnk");
    }

    #[test]
    fn a_broken_file_changes_nothing() {
        assert_eq!(Overlay::from_saved(Some(serde_json::json!("nonsense"))).added.len(), 0);
    }
}
