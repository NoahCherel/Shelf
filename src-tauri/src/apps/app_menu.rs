//! What right-clicking an app offers: its jump lists, then its own items, and running a choice.

use std::collections::HashMap;
use std::sync::Mutex;

use ::windows::core::{w, HSTRING, PCWSTR};
use ::windows::Win32::UI::Shell::ShellExecuteW;
use ::windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use tauri::AppHandle;

use crate::util::{lock, on_com_thread};
use ::windows::Win32::Globalization::GetUserDefaultUILanguage;

use super::menu::{self, Own};
use super::merge::{AppEntry, AppKind};
use super::{every_entry, history, icons, jumplist, pins, windows};
use super::commands::taken_off;

/// The jump list lines last shown, for their icons to follow without reading the lists again.
static LAST_JUMP: Mutex<Option<(String, Vec<jumplist::Link>)>> = Mutex::new(None);
/// Icons of jump list lines by where they come from, found or not.
static JUMP_ICONS: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

fn looks_like_path(key: &str) -> bool {
    key.contains('\\') || key.contains('/') || key.ends_with(".exe")
}

/// The pages a browser visited last, each opening in that browser.
fn history_of(exe: &str) -> Vec<jumplist::Link> {
    let Some(browser) = history::browser_for(exe) else { return Vec::new() };
    history::recent(&browser, HISTORY_LINES)
        .into_iter()
        .map(|visit| jumplist::Link {
            title: visit.title,
            path: exe.to_string(),
            args: history::as_argument(&visit.url),
            icon: visit.icon.unwrap_or_else(|| exe.to_string()),
            detail: visit.url,
        })
        .collect()
}

const HISTORY_LINES: usize = 8;

/// The jump lists Windows keeps for this app, in its order: the program's own categories, its recent
/// files, then its tasks; or File Explorer's quick access. Call on a COM thread. A browser
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
    let browser = program.as_deref().is_some_and(|exe| history::browser_for(exe).is_some());
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
    *lock(&LAST_JUMP) = Some((entry.key.clone(), shown));
    Ok(menu::menu_for(&entry, lang, lists))
}

/// The pictures of the jump list lines just shown for this app, each by the id of its line. They
/// come after the menu, so it isn't held up, and are kept once found.
#[tauri::command(async)]
pub fn apps_menu_icons(key: String) -> Result<Vec<(String, String)>, String> {
    let links = match &*lock(&LAST_JUMP) {
        Some((shown_for, links)) if *shown_for == key => links.clone(),
        _ => return Ok(Vec::new()),
    };
    on_com_thread(move || {
        links
            .iter()
            .filter_map(|link| {
                let known = lock(&JUMP_ICONS).as_ref().and_then(|m| m.get(&link.icon).cloned());
                let icon = known.unwrap_or_else(|| {
                    let found = icons::jump_icon(&link.icon);
                    lock(&JUMP_ICONS).get_or_insert_with(HashMap::new).insert(link.icon.clone(), found.clone());
                    found
                })?;
                Some((menu::jump_id(link), icon))
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
        Own::Pin => pins::pin(&app, &entry)?,
        Own::Unpin => pins::unpin(&app, &entry.key)?,
        Own::Close | Own::CloseAll => entry.windows.iter().for_each(|w| windows::close(w.hwnd)),
        Own::Remove | Own::Ungroup => taken_off(&app, &entry)?,
        Own::LeaveGroup => pins::left_group(&app, &entry.key)?,
    }
    Ok(())
}
