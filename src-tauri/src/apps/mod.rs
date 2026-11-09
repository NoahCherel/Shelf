//! The Apps widget's data: pins, open windows, icons, and the Start menu.

mod icons;
pub mod history;
pub mod jumplist;
pub mod menu;
pub mod merge;
mod pins;
pub mod previews;
pub mod stack;
mod windows;

use std::collections::HashMap;
use std::sync::Mutex;

use ::windows::core::{w, HSTRING, PCWSTR};
use ::windows::Win32::Globalization::GetUserDefaultUILanguage;
use ::windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use ::windows::Win32::UI::Input::KeyboardAndMouse::{VK_LWIN, VK_X};
use ::windows::Win32::UI::Shell::ShellExecuteW;
use ::windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use menu::Own;
use merge::{click_plan, merge, AppEntry, AppKind, Click};
use tauri::AppHandle;

use crate::system::tap_keys;

pub use windows::{exe_of_pid, start_is_open, store_string, take_foreground_raw, watch_foreground};

/// Sent once per icon, so the icons aren't copied to the page on every refresh.
static ICONS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
/// The shell's icon lookups aren't dependable when several run at once.
static ONE_LOOKUP: Mutex<()> = Mutex::new(());
static SOURCES: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
/// The jump list lines last shown, for their icons to follow without reading the lists again.
static LAST_JUMP: Mutex<Option<(String, Vec<jumplist::Link>)>> = Mutex::new(None);
/// Icons of jump list lines by where they come from, found or not.
static JUMP_ICONS: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);
/// What letting go of something dragged from Windows would do.
static DRAG_AIM: Mutex<Option<Aim>> = Mutex::new(None);
/// What's being dragged from Windows.
static DRAG_PATHS: Mutex<Vec<std::path::PathBuf>> = Mutex::new(Vec::new());

#[derive(Clone, Debug)]
enum Aim {
    Open(String),
    Place(usize),
}

/// Shell objects need their own COM apartment, so they get their own short-lived thread.
pub fn on_com_thread<R: Send + 'static>(f: impl FnOnce() -> R + Send + 'static) -> Result<R, String> {
    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        f()
    })
    .join()
    .map_err(|_| "shell call failed".to_string())
}

pub(crate) fn current() -> Result<Vec<AppEntry>, String> {
    let pins = pins::with_overlay(on_com_thread(pins::list)?);
    let entries = pins::arrange(pins::composed(merge(&pins, windows::list(), windows::foreground())), &pins::order());
    let sources = every_one(&entries).filter_map(|e| Some((e.key.clone(), e.icon_source.clone()?))).collect();
    *SOURCES.lock().unwrap_or_else(|e| e.into_inner()) = Some(sources);
    Ok(entries)
}

fn every_one(entries: &[AppEntry]) -> impl Iterator<Item = &AppEntry> {
    entries.iter().flat_map(|e| std::iter::once(e).chain(e.members.iter()))
}

/// Everything on the dock, with the apps inside groups as well as the groups.
pub(crate) fn every_entry() -> Result<Vec<AppEntry>, String> {
    Ok(every_one(&current()?).cloned().collect())
}

#[tauri::command(async)]
pub fn apps_list() -> Result<Vec<AppEntry>, String> {
    current()
}

#[tauri::command(async)]
pub fn apps_icon(key: String) -> Result<Option<String>, String> {
    let _one = ONE_LOOKUP.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(known) = ICONS.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|m| m.get(&key)) {
        return Ok(Some(known.clone()));
    }
    let source = SOURCES.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|m| m.get(&key).cloned());
    let Some(source) = source else { return Ok(None) };
    let icon = on_com_thread(move || icons::icon(&source))?;
    // A miss isn't remembered: the page asks again.
    if let Some(found) = &icon {
        let mut cache = ICONS.lock().unwrap_or_else(|e| e.into_inner());
        cache.get_or_insert_with(HashMap::new).insert(key, found.clone());
    }
    Ok(icon)
}

pub fn bring_forward(raw: isize) {
    windows::focus(raw);
}

/// A program's icon by its path, from the same cache as the apps themselves.
pub fn icon_of_exe(exe: String) -> Result<Option<String>, String> {
    let _one = ONE_LOOKUP.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(known) = ICONS.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|m| m.get(&exe)) {
        return Ok(Some(known.clone()));
    }
    let source = exe.clone();
    let icon = on_com_thread(move || icons::icon(&source))?;
    if let Some(found) = &icon {
        let mut cache = ICONS.lock().unwrap_or_else(|e| e.into_inner());
        cache.get_or_insert_with(HashMap::new).insert(exe, found.clone());
    }
    Ok(icon)
}

#[tauri::command(async)]
pub fn apps_activate(key: String) -> Result<(), String> {
    crate::preview::guard()?;
    let foreground = windows::foreground();
    let entries = every_entry()?;
    let entry = entries.iter().find(|e| e.key == key).ok_or("app is gone")?;
    match click_plan(entry, foreground) {
        Click::Focus(h) => windows::focus(h),
        Click::Minimize(h) => windows::minimize(h),
        Click::Launch => {
            if let Some(path) = &entry.launch {
                unsafe {
                    ShellExecuteW(None, w!("open"), &HSTRING::from(path), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
                }
            }
        }
    }
    Ok(())
}

/// Opens or closes Start by tapping the Windows key, like the real button. A click on the dock
/// can itself close Start, and then it must stay closed.
#[tauri::command]
pub fn start_menu() -> Result<(), String> {
    crate::preview::guard()?;
    if menu::should_press_start(windows::start_is_open(), windows::ms_since_start_closed()) {
        tap_keys(&[VK_LWIN]);
    }
    Ok(())
}

/// Windows' own quick menu, with Task Manager and the rest: the one Win+X opens.
#[tauri::command]
pub fn start_quick_menu() -> Result<(), String> {
    crate::preview::guard()?;
    tap_keys(&[VK_LWIN, VK_X]);
    Ok(())
}

/// The apps were dragged into a new order. Only Shelf's own file changes, so the preview may do it.
#[tauri::command(async)]
pub fn apps_reorder(app: AppHandle, keys: Vec<String>) -> Result<(), String> {
    crate::store::store_save(app, pins::OVERLAY.to_string(), pins::reordered(keys))
}

/// What taking this off the dock saves: a group comes undone, so no app is lost with it.
fn taken_off(entry: &AppEntry) -> serde_json::Value {
    match entry.kind {
        AppKind::App => pins::unpin(&entry.key),
        AppKind::File | AppKind::Folder => pins::removed_item(&entry.key),
        AppKind::Group => pins::ungrouped(&entry.key),
    }
}

/// Something dragged off the dock. Only what's pinned can go, and only from the dock.
#[tauri::command(async)]
pub fn apps_unpin(app: AppHandle, key: String) -> Result<(), String> {
    let entry = current()?.into_iter().find(|e| e.key == key).ok_or("app is gone")?;
    if !entry.pinned {
        return Err("not pinned".into());
    }
    crate::store::store_save(app, pins::OVERLAY.to_string(), taken_off(&entry))
}

/// One app held over another, or over a group.
#[tauri::command(async)]
pub fn apps_group(app: AppHandle, onto: String, dragged: String) -> Result<(), String> {
    let entries = current()?;
    let find = |key: &str| entries.iter().find(|e| e.key == key).ok_or("app is gone");
    let (target, moved) = (find(&onto)?, find(&dragged)?);
    if !pins::can_group(moved, target) {
        return Err("those can't be grouped".into());
    }
    crate::store::store_save(app, pins::OVERLAY.to_string(), pins::grouped(target, moved))
}

#[tauri::command(async)]
pub fn apps_group_rename(app: AppHandle, key: String, name: String) -> Result<(), String> {
    crate::store::store_save(app, pins::OVERLAY.to_string(), pins::renamed_group(&key, &name))
}

/// Where a folder on the dock points, only if it's one of the dock's.
fn folder_of(key: &str) -> Result<String, String> {
    current()?.into_iter().find(|e| e.key == key && e.kind == AppKind::Folder).and_then(|e| e.launch).ok_or_else(|| "folder is gone".to_string())
}

#[tauri::command(async)]
pub fn apps_stack(key: String) -> Result<stack::Stack, String> {
    let (found, more) = stack::read(&folder_of(&key)?);
    Ok(stack::stack_of(&found, more))
}

/// The pictures of what a folder holds, each by the id of its line.
#[tauri::command(async)]
pub fn apps_stack_icons(key: String) -> Result<Vec<(String, String)>, String> {
    let (found, _) = stack::read(&folder_of(&key)?);
    on_com_thread(move || {
        found
            .iter()
            .filter_map(|f| {
                let icon = icons::icon(&f.path)?;
                Some((jumplist::fingerprint(&stack::link_of(f)), icon))
            })
            .collect()
    })
}

/// A line of a folder runs only if it's still there when read again.
#[tauri::command(async)]
pub fn apps_stack_open(key: String, id: String) -> Result<(), String> {
    crate::preview::guard()?;
    let (found, _) = stack::read(&folder_of(&key)?);
    let links: Vec<jumplist::Link> = found.iter().map(stack::link_of).collect();
    on_com_thread(move || {
        let link = jumplist::find(&links, &id).ok_or("that's no longer in the folder")?;
        jumplist::open(link);
        Ok::<(), String>(())
    })?
}

/// What letting go would do, as the page sees it: open in the app `key`, or take the place `index`.
#[tauri::command]
pub fn apps_drag_target(key: Option<String>, index: Option<usize>) {
    *DRAG_AIM.lock().unwrap_or_else(|e| e.into_inner()) = key.map(Aim::Open).or(index.map(Aim::Place));
}

/// A drag from Windows has come onto the dock. True if it would be pinned wherever it's dropped.
pub fn drag_entered(paths: &[std::path::PathBuf]) {
    *DRAG_PATHS.lock().unwrap_or_else(|e| e.into_inner()) = paths.to_vec();
}

pub fn drag_is_pinnable() -> bool {
    DRAG_PATHS.lock().unwrap_or_else(|e| e.into_inner()).iter().all(|p| matches!(pins::dropped(&p.to_string_lossy(), |d| std::path::Path::new(d).is_dir()), pins::Dropped::Program | pins::Dropped::Shortcut))
}

/// The picture of what's being dragged, for the place the dock opens for it.
#[tauri::command(async)]
pub fn apps_drag_icon() -> Result<Option<String>, String> {
    let Some(first) = DRAG_PATHS.lock().unwrap_or_else(|e| e.into_inner()).first().cloned() else { return Ok(None) };
    on_com_thread(move || icons::icon(&first.to_string_lossy()))
}

/// Opens what was dropped on an app's icon with that app.
fn open_in_app(key: &str, paths: &[String]) {
    if crate::preview::guard().is_err() {
        return;
    }
    let launch = every_entry().ok().and_then(|all| all.into_iter().find(|e| e.key == key && e.kind == AppKind::App)).and_then(|e| e.launch);
    let Some(launch) = launch else { return };
    let params = paths.iter().map(|p| format!("\"{p}\"")).collect::<Vec<_>>().join(" ");
    unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from(launch), &HSTRING::from(params), PCWSTR::null(), SW_SHOWNORMAL);
    }
}

/// Something dragged from Windows has stayed over this app: it comes to the front, to be dropped on.
#[tauri::command(async)]
pub fn apps_drag_raise(key: String) -> Result<(), String> {
    crate::preview::guard()?;
    let entry = current()?.into_iter().find(|e| e.key == key).ok_or("app is gone")?;
    if let (false, Some(window)) = (entry.active, entry.windows.first()) {
        windows::focus(window.hwnd);
    }
    Ok(())
}

/// What's dropped on the dock from the desktop or File Explorer is kept on it: programs and
/// shortcuts as apps, the rest as files and folders.
pub fn pin_dropped(app: AppHandle, paths: Vec<std::path::PathBuf>) {
    DRAG_PATHS.lock().unwrap_or_else(|e| e.into_inner()).clear();
    let aim = DRAG_AIM.lock().unwrap_or_else(|e| e.into_inner()).take();
    let on_icon = matches!(aim, Some(Aim::Open(_)));
    crate::diag::note(&format!("drop on an icon: {on_icon}"));
    std::thread::spawn(move || {
        if let Some(Aim::Open(key)) = &aim {
            let files: Vec<String> = paths
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .filter(|p| matches!(pins::dropped(p, |d| std::path::Path::new(d).is_dir()), pins::Dropped::File | pins::Dropped::Folder))
                .collect();
            open_in_app(key, &files);
        }
        for (offset, path) in paths.into_iter().enumerate() {
            let path = path.to_string_lossy().into_owned();
            let place = match aim {
                Some(Aim::Place(index)) => current().ok().map(|shown| (index + offset, shown.into_iter().map(|e| e.key).collect())),
                _ => None,
            };
            let kept = on_com_thread(move || pins::pin_dropped(&path, on_icon, place));
            crate::diag::note(&format!("drop kept: {}", matches!(kept, Ok(Some(_)))));
            if let Ok(Some(value)) = kept {
                let saved = crate::store::store_save(app.clone(), pins::OVERLAY.to_string(), value);
                crate::diag::note(&format!("drop saved: {}", saved.is_ok()));
            }
        }
        let _ = tauri::Emitter::emit(&app, "apps-changed", ());
    });
}

fn is_browser(exe: &str) -> bool {
    let name = exe.rsplit(['\\', '/']).next().unwrap_or(exe).to_lowercase();
    ["firefox.exe", "chrome.exe", "msedge.exe", "brave.exe", "opera.exe", "vivaldi.exe"].contains(&name.as_str())
}

fn looks_like_path(key: &str) -> bool {
    key.contains('\\') || key.contains('/') || key.ends_with(".exe")
}

/// The jump lists Windows keeps for this app: File Explorer's quick access, a program's tasks, and the
/// recent files of an app with an id of its own. Call on a COM thread.
/// The pages a browser visited last, each opening in that browser.
fn history_of(exe: &str) -> Vec<jumplist::Link> {
    let Some(browser) = history::browser_for(exe) else { return Vec::new() };
    history::recent(&browser, HISTORY_LINES)
        .into_iter()
        .map(|visit| jumplist::Link {
            title: visit.title,
            path: exe.to_string(),
            args: format!("\"{}\"", visit.url),
            icon: visit.icon.unwrap_or_else(|| exe.to_string()),
            detail: visit.url,
        })
        .collect()
}

const HISTORY_LINES: usize = 8;

/// In Windows' order: the program's own categories, its recent files, then its tasks. A browser
/// shows the pages it visited last first, instead of the sites it reckons most visited.
fn jump_lists(entry: &AppEntry, lang: u16) -> Vec<(String, Vec<jumplist::Link>)> {
    use jumplist::{section_title, Category, Kind};
    let title = |kind| section_title(kind, lang).to_string();
    if entry.key == "microsoft.windows.explorer" {
        return vec![(title(Kind::QuickAccess), jumplist::quick_access())];
    }
    let program = entry.launch.as_deref().and_then(|launch| {
        if launch.to_lowercase().ends_with(".lnk") {
            pins::link_target(launch)
        } else {
            launch.to_lowercase().ends_with(".exe").then(|| launch.to_string())
        }
    });
    let app_id = (!looks_like_path(&entry.key)).then_some(entry.key.as_str());
    let own = jumplist::lists(app_id, program.as_deref());
    let recent = app_id.map(jumplist::recent).unwrap_or_default();
    // A browser's own categories are its most visited sites, by its own reckoning: the owner wants
    // what's recent instead.
    let browser = program.as_deref().is_some_and(is_browser);
    let mut out: Vec<(String, Vec<jumplist::Link>)> = own
        .iter()
        .filter_map(|(c, links)| match c {
            Category::Named(name) if !browser => Some((name.clone(), links.clone())),
            _ => None,
        })
        .collect();
    if browser {
        out.push((title(Kind::History), program.as_deref().map(history_of).unwrap_or_default()));
    }
    out.push((title(Kind::Recent), recent));
    out.extend(own.into_iter().filter(|(c, _)| *c == Category::Tasks).map(|(_, links)| (title(Kind::Tasks), links)));
    out
}

/// What right-clicking this app offers, in Windows' language: its jump lists, then its own items.
#[tauri::command(async)]
pub fn apps_menu(key: String) -> Result<menu::AppMenu, String> {
    let entry = every_entry()?.into_iter().find(|e| e.key == key).ok_or("app is gone")?;
    let lang = unsafe { GetUserDefaultUILanguage() };
    let for_lists = entry.clone();
    let lists = if entry.kind == AppKind::App { on_com_thread(move || jump_lists(&for_lists, lang)).unwrap_or_default() } else { Vec::new() };
    let shown = lists.iter().flat_map(|(_, links)| links.clone()).collect();
    *LAST_JUMP.lock().unwrap_or_else(|e| e.into_inner()) = Some((entry.key.clone(), shown));
    Ok(menu::menu_for(&entry, lang, lists))
}

/// The pictures of the jump list lines just shown for this app, each by the id of its line. They
/// come after the menu, so it isn't held up, and are kept once found.
#[tauri::command(async)]
pub fn apps_menu_icons(key: String) -> Result<Vec<(String, String)>, String> {
    let links = match &*LAST_JUMP.lock().unwrap_or_else(|e| e.into_inner()) {
        Some((shown_for, links)) if *shown_for == key => links.clone(),
        _ => return Ok(Vec::new()),
    };
    on_com_thread(move || {
        links
            .iter()
            .filter_map(|link| {
                let known = JUMP_ICONS.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|m| m.get(&link.icon).cloned());
                let icon = known.unwrap_or_else(|| {
                    let found = icons::jump_icon(&link.icon);
                    JUMP_ICONS.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).insert(link.icon.clone(), found.clone());
                    found
                })?;
                Some((format!("jump:{}", jumplist::fingerprint(link)), icon))
            })
            .collect()
    })
}

#[tauri::command(async)]
pub fn apps_menu_choose(app: AppHandle, key: String, id: String) -> Result<(), String> {
    crate::preview::guard()?;
    let entry = every_entry()?.into_iter().find(|e| e.key == key).ok_or("app is gone")?;
    // A jump list line runs only if it's still there when read again.
    if let Some(print) = menu::jump_from(&id) {
        let print = print.to_string();
        return on_com_thread(move || {
            let lists = jump_lists(&entry, unsafe { GetUserDefaultUILanguage() });
            let links: Vec<jumplist::Link> = lists.into_iter().flat_map(|(_, links)| links).collect();
            let link = jumplist::find(&links, &print).ok_or("that line is no longer in the list")?;
            jumplist::open(link);
            Ok::<(), String>(())
        })?;
    }
    let choice = menu::own_from(&id).ok_or("unknown choice")?;
    match choice {
        Own::Open => {
            if let Some(path) = &entry.launch {
                unsafe {
                    ShellExecuteW(None, w!("open"), &HSTRING::from(path), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
                }
            }
        }
        Own::Pin => crate::store::store_save(app, pins::OVERLAY.to_string(), pins::pin(&entry))?,
        Own::Unpin => crate::store::store_save(app, pins::OVERLAY.to_string(), pins::unpin(&entry.key))?,
        Own::Close | Own::CloseAll => entry.windows.iter().for_each(|w| windows::close(w.hwnd)),
        Own::Remove | Own::Ungroup => crate::store::store_save(app, pins::OVERLAY.to_string(), taken_off(&entry))?,
        Own::LeaveGroup => crate::store::store_save(app, pins::OVERLAY.to_string(), pins::left_group(&entry.key))?,
    }
    Ok(())
}
