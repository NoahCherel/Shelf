//! The apps pinned to the Windows taskbar, read from their shortcuts.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use windows::core::{Interface, HSTRING};
use windows::Win32::System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::merge::{keep_pin, AppEntry, AppKind, Pin};
use super::windows::{store_string, APP_ID_KEY};

/// Pins made from the dock's own menu. Windows has no public way to pin to its taskbar, and it's
/// hidden anyway, so these sit on top of its list and leave it untouched.
const OVERLAY: &str = "dock-pins";
/// How many apps' places are remembered. Apps that come and go would otherwise grow it forever.
pub const ORDER_LIMIT: usize = 200;
/// Long enough for any sensible name, and short enough for the group's card.
pub const GROUP_NAME_LIMIT: usize = 40;

const ITEM: &str = "item:";
const GROUP: &str = "group:";

#[derive(Serialize, Deserialize, Default, Debug)]
struct AddedPin {
    key: String,
    name: String,
    source: String,
}

/// A file or folder kept on the dock.
#[derive(Serialize, Deserialize, Clone, Debug)]
struct DockItem {
    path: String,
    name: String,
    folder: bool,
}

/// Apps gathered under one tile, by their keys.
#[derive(Serialize, Deserialize, Clone, Debug)]
struct Group {
    id: String,
    name: String,
    members: Vec<String>,
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
    #[serde(default)]
    items: Vec<DockItem>,
    #[serde(default)]
    groups: Vec<Group>,
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

    /// Puts this at a place among what the dock shows.
    fn place_at(&mut self, key: &str, index: usize, shown: Vec<String>) {
        let mut keys: Vec<String> = shown.into_iter().filter(|k| k != key).collect();
        keys.insert(index.min(keys.len()), key.to_string());
        self.set_order(keys);
    }

    /// A program, or a shortcut to one, dropped on the dock. `opens` is what a shortcut points to.
    fn pin_program(&mut self, path: &str, opens: Option<&str>) -> String {
        let key = opens.unwrap_or(path).to_lowercase();
        if let Some(hidden) = self.removed.iter().position(|k| *k == key) {
            self.removed.remove(hidden);
        }
        if !self.added.iter().any(|a| a.key == key) {
            self.added.push(AddedPin { key: key.clone(), name: file_stem(path).to_string(), source: path.to_string() });
        }
        key
    }

    fn add_item(&mut self, path: &str, folder: bool) -> String {
        if !self.items.iter().any(|i| i.path.eq_ignore_ascii_case(path)) {
            let name = path.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or(path).to_string();
            self.items.push(DockItem { path: path.to_string(), name, folder });
        }
        item_key(path)
    }

    fn remove_item(&mut self, key: &str) {
        self.items.retain(|i| item_key(&i.path) != key);
    }

    fn swap_in_order(&mut self, key: &str, with: &[String]) {
        if let Some(at) = self.order.iter().position(|k| k == key) {
            self.order.splice(at..=at, with.iter().cloned());
        }
    }

    /// One app dragged onto another makes a group where the other was; onto a group, it joins.
    fn group(&mut self, onto: &str, dragged: &str) {
        if let Some(group) = self.groups.iter_mut().find(|g| group_key(&g.id) == onto) {
            if !group.members.iter().any(|k| k == dragged) {
                group.members.push(dragged.to_string());
            }
        } else {
            let id = (1..).map(|n: u32| n.to_string()).find(|id| !self.groups.iter().any(|g| g.id == *id)).unwrap_or_default();
            self.groups.push(Group { id: id.clone(), name: "Group".to_string(), members: vec![onto.to_string(), dragged.to_string()] });
            self.swap_in_order(onto, &[group_key(&id)]);
        }
        self.order.retain(|k| k != dragged);
    }

    fn rename_group(&mut self, key: &str, name: &str) {
        let name: String = name.trim().chars().take(GROUP_NAME_LIMIT).collect();
        if let Some(group) = self.groups.iter_mut().find(|g| group_key(&g.id) == key).filter(|_| !name.is_empty()) {
            group.name = name;
        }
    }

    /// The apps go back where the group was.
    fn ungroup(&mut self, key: &str) {
        if let Some(at) = self.groups.iter().position(|g| group_key(&g.id) == key) {
            let group = self.groups.remove(at);
            self.swap_in_order(key, &group.members);
        }
    }

    /// The app goes just after its group. A group can't be left with only one app.
    fn leave_group(&mut self, member: &str) {
        let Some(group) = self.groups.iter_mut().find(|g| g.members.iter().any(|k| k == member)) else { return };
        let key = group_key(&group.id);
        if group.members.len() <= 2 {
            return self.ungroup(&key);
        }
        group.members.retain(|k| k != member);
        if let Some(at) = self.order.iter().position(|k| *k == key) {
            self.order.insert(at + 1, member.to_string());
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

fn item_key(path: &str) -> String {
    format!("{ITEM}{}", path.to_lowercase())
}

fn group_key(id: &str) -> String {
    format!("{GROUP}{id}")
}

/// Groups in the place of their first app, then files and folders that still exist. A group with
/// fewer than two of its apps left isn't one, and what's left of it shows on its own.
fn compose(mut entries: Vec<AppEntry>, overlay: &Overlay, exists: impl Fn(&str) -> bool) -> Vec<AppEntry> {
    for group in &overlay.groups {
        let members: Vec<AppEntry> = group
            .members
            .iter()
            .filter_map(|key| entries.iter().find(|e| e.key == *key).cloned())
            .map(|member| AppEntry { grouped: true, ..member })
            .collect();
        if members.len() < 2 {
            continue;
        }
        let at = entries.iter().position(|e| group.members.contains(&e.key)).unwrap_or(entries.len());
        entries.retain(|e| !group.members.contains(&e.key));
        entries.insert(
            at,
            AppEntry {
                key: group_key(&group.id),
                name: group.name.clone(),
                pinned: true,
                active: members.iter().any(|m| m.active),
                windows: members.iter().flat_map(|m| m.windows.clone()).collect(),
                kind: AppKind::Group,
                members,
                ..Default::default()
            },
        );
    }
    entries.extend(overlay.items.iter().filter(|i| exists(&i.path)).map(|i| AppEntry {
        key: item_key(&i.path),
        name: i.name.clone(),
        pinned: true,
        launch: Some(i.path.clone()),
        icon_source: Some(i.path.clone()),
        kind: if i.folder { AppKind::Folder } else { AppKind::File },
        ..Default::default()
    }));
    entries
}

/// Only apps go in groups, and they go on another app or a group.
pub fn can_group(dragged: &AppEntry, onto: &AppEntry) -> bool {
    dragged.key != onto.key && dragged.kind == AppKind::App && matches!(onto.kind, AppKind::App | AppKind::Group)
}

/// A file dropped on an app's icon was aimed at that app, so it isn't kept on the dock.
pub fn keeps_dropped(what: &Dropped, on_icon: bool) -> bool {
    matches!(what, Dropped::Program | Dropped::Shortcut) || !on_icon
}

fn apply(windows_pins: Vec<Pin>, overlay: &Overlay, exists: impl Fn(&str) -> bool) -> Vec<Pin> {
    let mut pins: Vec<Pin> = windows_pins.into_iter().filter(|p| !overlay.removed.contains(&key_of(p))).collect();
    for added in &overlay.added {
        let path = is_path(&added.key) || added.source.eq_ignore_ascii_case(&added.key);
        let pin = Pin {
            name: added.name.clone(),
            link: added.source.clone(),
            // A shortcut is known by what it opens, like the windows that come from it.
            target: path.then(|| if added.source.to_lowercase().ends_with(".lnk") { added.key.clone() } else { added.source.clone() }),
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

/// Reads, changes and saves as one step, so two changes at the same moment can't lose either.
fn update(
    load: impl FnOnce() -> Option<serde_json::Value>,
    save: impl FnOnce(serde_json::Value) -> Result<(), String>,
    change: impl FnOnce(&mut Overlay),
) -> Result<(), String> {
    static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());
    let _one = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
    let mut overlay = Overlay::from_saved(load());
    change(&mut overlay);
    save(serde_json::to_value(overlay).unwrap_or_default())
}

fn changed(app: &AppHandle, change: impl FnOnce(&mut Overlay)) -> Result<(), String> {
    update(|| crate::store::load(OVERLAY), |value| crate::store::store_save(app.clone(), OVERLAY.to_string(), value), change)
}

/// The dock's entries with its groups, files and folders.
pub fn composed(entries: Vec<AppEntry>) -> Vec<AppEntry> {
    compose(entries, &Overlay::from_saved(crate::store::load(OVERLAY)), |path| Path::new(path).exists())
}

/// One app was dragged onto another or onto a group. Apps in a group have to stay when closed, so
/// they're pinned.
pub fn grouped(app: &AppHandle, onto: &AppEntry, dragged: &AppEntry) -> Result<(), String> {
    changed(app, |o| {
        for entry in [onto, dragged] {
            if entry.kind == AppKind::App && !entry.pinned {
                o.pin(entry);
            }
        }
        o.group(&onto.key, &dragged.key);
    })
}

pub fn renamed_group(app: &AppHandle, key: &str, name: &str) -> Result<(), String> {
    changed(app, |o| o.rename_group(key, name))
}

pub fn ungrouped(app: &AppHandle, key: &str) -> Result<(), String> {
    changed(app, |o| o.ungroup(key))
}

pub fn left_group(app: &AppHandle, member: &str) -> Result<(), String> {
    changed(app, |o| o.leave_group(member))
}

pub fn removed_item(app: &AppHandle, key: &str) -> Result<(), String> {
    changed(app, |o| o.remove_item(key))
}

pub fn pin(app: &AppHandle, entry: &AppEntry) -> Result<(), String> {
    changed(app, |o| o.pin(entry))
}

pub fn unpin(app: &AppHandle, key: &str) -> Result<(), String> {
    changed(app, |o| o.unpin(key))
}

/// The apps were dragged into a new order.
pub fn reordered(app: &AppHandle, keys: Vec<String>) -> Result<(), String> {
    changed(app, |o| o.set_order(keys))
}

/// The saved order of the dock's apps.
pub fn order() -> Vec<String> {
    Overlay::from_saved(crate::store::load(OVERLAY)).order
}

/// Keeps what was dropped on the dock; None if it isn't kept. Call on a thread with COM initialised,
/// as a shortcut has to be read.
pub fn pin_dropped(app: &AppHandle, path: &str, on_icon: bool, place: Option<(usize, Vec<String>)>) -> Option<Result<(), String>> {
    let what = dropped(path, |p| Path::new(p).is_dir());
    if !keeps_dropped(&what, on_icon) {
        return None;
    }
    let opens = match what {
        Dropped::Program => None,
        Dropped::Shortcut => Some(read_link(Path::new(path))?.target?),
        Dropped::Folder | Dropped::File => None,
    };
    Some(changed(app, |o| {
        let key = match what {
            Dropped::Folder => o.add_item(path, true),
            Dropped::File => o.add_item(path, false),
            _ => o.pin_program(path, opens.as_deref()),
        };
        if let Some((index, shown)) = place {
            o.place_at(&key, index, shown);
        }
    }))
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
    use crate::apps::merge::{merge, AppWindow};

    fn pin(name: &str, target: &str) -> Pin {
        Pin { name: name.into(), link: format!("{name}.lnk"), target: Some(target.into()), app_id: None }
    }

    fn entry(key: &str, name: &str, source: &str) -> AppEntry {
        AppEntry { key: key.into(), name: name.into(), pinned: false, active: false, windows: Vec::new(), launch: Some(source.into()), icon_source: Some(source.into()), ..Default::default() }
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

    fn open_app(key: &str, hwnd: isize, active: bool) -> AppEntry {
        AppEntry { active, windows: vec![AppWindow { hwnd, title: key.into() }], ..entry(key, key, key) }
    }

    #[test]
    fn a_file_or_folder_is_added_once_and_named_after_itself() {
        let mut overlay = Overlay::default();
        overlay.add_item(r"C:\Users\me\Notes.txt", false);
        overlay.add_item(r"C:\Users\me\Notes.txt", false);
        overlay.add_item(r"C:\Users\me\Work", true);
        let shown = compose(Vec::new(), &overlay, EXISTS);
        assert_eq!(keys(&shown), [r"item:c:\users\me\notes.txt", r"item:c:\users\me\work"]);
        assert_eq!(shown[0].name, "Notes.txt");
        assert_eq!(shown[0].kind, AppKind::File);
        assert_eq!(shown[1].kind, AppKind::Folder);
        assert_eq!(shown[1].launch.as_deref(), Some(r"C:\Users\me\Work"));
        assert!(shown[0].pinned, "so it can be pulled off the dock");
    }

    #[test]
    fn a_file_deleted_elsewhere_leaves_the_dock() {
        let mut overlay = Overlay::default();
        overlay.add_item(r"C:\gone.txt", false);
        assert!(compose(Vec::new(), &overlay, |_| false).is_empty());
    }

    #[test]
    fn a_file_can_be_taken_off_the_dock() {
        let mut overlay = Overlay::default();
        overlay.add_item(r"C:\a.txt", false);
        overlay.remove_item(r"item:c:\a.txt");
        assert!(compose(Vec::new(), &overlay, EXISTS).is_empty());
    }

    #[test]
    fn a_group_takes_the_place_of_its_first_app_and_holds_them() {
        let mut overlay = Overlay::default();
        overlay.group("b", "d");
        let shown = compose(named(&["a", "b", "c", "d"]), &overlay, EXISTS);
        assert_eq!(keys(&shown), ["a", "group:1", "c"]);
        assert_eq!(shown[1].kind, AppKind::Group);
        assert_eq!(keys(&shown[1].members), ["b", "d"]);
        assert!(shown[1].members.iter().all(|m| m.grouped));
    }

    #[test]
    fn a_group_shows_when_one_of_its_apps_is_open_or_in_front() {
        let mut overlay = Overlay::default();
        overlay.group("a", "b");
        let shown = compose(vec![entry("a", "a", "a"), open_app("b", 7, true)], &overlay, EXISTS);
        assert_eq!(shown[0].windows.len(), 1);
        assert!(shown[0].active);
    }

    #[test]
    fn an_app_dragged_onto_a_group_joins_it() {
        let mut overlay = Overlay::default();
        overlay.group("a", "b");
        overlay.group("group:1", "c");
        let shown = compose(named(&["a", "b", "c"]), &overlay, EXISTS);
        assert_eq!(keys(&shown), ["group:1"]);
        assert_eq!(keys(&shown[0].members), ["a", "b", "c"]);
    }

    #[test]
    fn each_new_group_gets_its_own_key() {
        let mut overlay = Overlay::default();
        overlay.group("a", "b");
        overlay.group("c", "d");
        overlay.ungroup("group:1");
        overlay.group("e", "f");
        let ids: std::collections::HashSet<_> = overlay.groups.iter().map(|g| g.id.clone()).collect();
        assert_eq!(ids.len(), 2);
    }

    #[test]
    fn a_group_keeps_the_place_of_the_app_it_was_made_on() {
        let mut overlay = Overlay::default();
        overlay.set_order(vec!["c".into(), "a".into(), "b".into()]);
        overlay.group("a", "c");
        assert_eq!(overlay.order, ["group:1", "b"]);
    }

    #[test]
    fn a_group_left_with_one_app_comes_undone() {
        let mut overlay = Overlay::default();
        overlay.set_order(vec!["group:1".into(), "z".into()]);
        overlay.groups.push(Group { id: "1".into(), name: "G".into(), members: vec!["a".into(), "b".into()] });
        overlay.leave_group("b");
        assert!(overlay.groups.is_empty());
        assert_eq!(overlay.order, ["a", "b", "z"], "both go back where it was");
    }

    #[test]
    fn leaving_a_larger_group_puts_the_app_just_after_it() {
        let mut overlay = Overlay::default();
        overlay.set_order(vec!["group:1".into(), "z".into()]);
        overlay.groups.push(Group { id: "1".into(), name: "G".into(), members: vec!["a".into(), "b".into(), "c".into()] });
        overlay.leave_group("b");
        assert_eq!(overlay.groups[0].members, ["a", "c"]);
        assert_eq!(overlay.order, ["group:1", "b", "z"]);
    }

    #[test]
    fn ungrouping_puts_the_apps_back_where_the_group_was() {
        let mut overlay = Overlay::default();
        overlay.set_order(vec!["x".into(), "group:1".into(), "z".into()]);
        overlay.groups.push(Group { id: "1".into(), name: "G".into(), members: vec!["a".into(), "b".into()] });
        overlay.ungroup("group:1");
        assert!(overlay.groups.is_empty());
        assert_eq!(overlay.order, ["x", "a", "b", "z"]);
    }

    #[test]
    fn a_group_with_one_app_still_installed_shows_that_app_alone() {
        let mut overlay = Overlay::default();
        overlay.group("a", "b");
        let shown = compose(named(&["a"]), &overlay, EXISTS);
        assert_eq!(keys(&shown), ["a"]);
        assert!(!shown[0].grouped);
    }

    #[test]
    fn a_group_can_be_renamed_but_not_to_nothing() {
        let mut overlay = Overlay::default();
        overlay.group("a", "b");
        overlay.rename_group("group:1", "  Work  ");
        assert_eq!(overlay.groups[0].name, "Work");
        overlay.rename_group("group:1", "   ");
        assert_eq!(overlay.groups[0].name, "Work");
        overlay.rename_group("group:1", &"x".repeat(200));
        assert_eq!(overlay.groups[0].name.chars().count(), GROUP_NAME_LIMIT);
    }

    #[test]
    fn a_file_saved_before_there_were_items_or_groups_still_reads() {
        let old = Overlay::from_saved(Some(serde_json::json!({ "added": [], "removed": [], "order": ["a"] })));
        assert!(old.items.is_empty() && old.groups.is_empty());
        assert_eq!(old.order, ["a"]);
    }

    #[test]
    fn a_file_dropped_on_an_apps_icon_was_meant_for_the_app() {
        assert!(keeps_dropped(&Dropped::File, false));
        assert!(keeps_dropped(&Dropped::Folder, false));
        assert!(!keeps_dropped(&Dropped::File, true));
        assert!(!keeps_dropped(&Dropped::Folder, true));
        assert!(keeps_dropped(&Dropped::Program, true), "a program is always pinned");
    }

    #[test]
    fn only_apps_go_in_groups_and_only_on_an_app_or_a_group() {
        let of = |key: &str, kind| AppEntry { kind, ..entry(key, key, key) };
        assert!(can_group(&of("a", AppKind::App), &of("b", AppKind::App)));
        assert!(can_group(&of("a", AppKind::App), &of("g", AppKind::Group)));
        assert!(!can_group(&of("a", AppKind::App), &of("a", AppKind::App)));
        assert!(!can_group(&of("f", AppKind::File), &of("b", AppKind::App)));
        assert!(!can_group(&of("g", AppKind::Group), &of("b", AppKind::App)));
        assert!(!can_group(&of("a", AppKind::App), &of("d", AppKind::Folder)));
    }

    #[test]
    fn a_dropped_shortcut_is_known_by_what_it_opens_so_it_can_be_taken_off() {
        let mut overlay = Overlay::default();
        overlay.pin_program(r"C:\Users\me\Desktop\Game.lnk", Some(r"D:\Games\game.exe"));
        let pins = apply(Vec::new(), &overlay, EXISTS);
        assert_eq!(key_of(&pins[0]), overlay.added[0].key, "the key the dock shows is the one saved");
        assert_eq!(pins[0].link, r"C:\Users\me\Desktop\Game.lnk", "it still opens and looks like its shortcut");
        let shown = merge(&pins, Vec::new(), 0);
        overlay.unpin(&shown[0].key);
        assert!(apply(Vec::new(), &overlay, EXISTS).is_empty());
    }

    #[test]
    fn what_is_dropped_goes_where_the_dock_opened_a_place() {
        let mut overlay = Overlay::default();
        overlay.place_at("new", 1, vec!["a".into(), "b".into()]);
        assert_eq!(overlay.order, ["a", "new", "b"]);
        overlay.place_at("new", 99, vec!["a".into(), "new".into(), "b".into()]);
        assert_eq!(overlay.order, ["a", "b", "new"], "already there, it moves, and past the end is the end");
    }

    #[test]
    fn changes_made_at_the_same_moment_are_all_kept() {
        let saved = Mutex::new(None::<serde_json::Value>);
        std::thread::scope(|scope| {
            for i in 0..8 {
                let saved = &saved;
                scope.spawn(move || {
                    update(
                        || {
                            let read = saved.lock().unwrap().clone();
                            std::thread::sleep(std::time::Duration::from_millis(5));
                            read
                        },
                        |value| {
                            *saved.lock().unwrap() = Some(value);
                            Ok(())
                        },
                        |o| {
                            o.add_item(&format!(r"C:\file{i}.txt"), false);
                        },
                    )
                    .unwrap();
                });
            }
        });
        assert_eq!(Overlay::from_saved(saved.into_inner().unwrap()).items.len(), 8);
    }

    #[test]
    fn a_broken_file_changes_nothing() {
        assert_eq!(Overlay::from_saved(Some(serde_json::json!("nonsense"))).added.len(), 0);
    }
}
