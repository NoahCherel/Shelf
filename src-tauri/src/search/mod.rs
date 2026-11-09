//! The Search card's data. The page only ever names things by the ids given to it here, and web
//! searches are built here too, so it can't launch or visit anything of its own choosing.

mod apps;
mod files;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};

use serde::Serialize;
use windows::core::{w, HSTRING, PCWSTR};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use crate::apps::{icon_of_exe, on_com_thread};

#[derive(Serialize, Clone, Debug)]
pub struct SearchItem {
    id: String,
    name: String,
    kind: &'static str,
    detail: Option<String>,
}

/// What each id handed to the page opens.
#[derive(Default)]
struct Known(HashMap<String, String>);

impl Known {
    fn remember(&mut self, item: &SearchItem, target: &str) {
        self.0.insert(item.id.clone(), target.to_string());
    }

    fn target(&self, id: &str) -> Option<String> {
        self.0.get(id).cloned()
    }
}

/// The newest file search. Older ones stop at their next result.
#[derive(Default)]
struct Tickets(AtomicU64);

impl Tickets {
    fn issue(&self, ticket: u64) {
        self.0.fetch_max(ticket, Ordering::SeqCst);
    }

    fn is_current(&self, ticket: u64) -> bool {
        self.0.load(Ordering::SeqCst) == ticket
    }
}

static KNOWN: LazyLock<Mutex<Known>> = LazyLock::new(Default::default);
static TICKETS: Tickets = Tickets(AtomicU64::new(0));
static APPS: Mutex<Option<Vec<SearchItem>>> = Mutex::new(None);
static REFRESHING: AtomicBool = AtomicBool::new(false);

fn web_url(query: &str) -> String {
    let encoded: String = query
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect();
    format!("https://www.google.com/search?q={encoded}")
}

fn read_apps() -> Result<Vec<SearchItem>, String> {
    let found = on_com_thread(apps::list)??;
    let mut known = KNOWN.lock().unwrap_or_else(|e| e.into_inner());
    let items: Vec<SearchItem> = found
        .into_iter()
        .map(|(name, parsing)| {
            let item = SearchItem { id: format!("app:{parsing}"), name, kind: "app", detail: None };
            known.remember(&item, &format!(r"shell:AppsFolder\{parsing}"));
            item
        })
        .collect();
    *APPS.lock().unwrap_or_else(|e| e.into_inner()) = Some(items.clone());
    Ok(items)
}

/// An app's name from the list: None until the list is known, then None inside if it isn't on it.
pub fn listed_name(parsing: &str) -> Option<Option<String>> {
    let apps = APPS.lock().unwrap_or_else(|e| e.into_inner());
    let list = apps.as_ref().filter(|l| !l.is_empty())?;
    let id = format!("app:{parsing}");
    Some(list.iter().find(|a| a.id.eq_ignore_ascii_case(&id)).map(|a| a.name.clone()))
}

/// Listing every app takes about a second, so it happens in the background.
pub fn refresh_apps() {
    if REFRESHING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        let _ = read_apps();
        REFRESHING.store(false, Ordering::SeqCst);
    });
}

/// What's known at once, with a fresh list on its way for next time.
#[tauri::command(async)]
pub fn search_apps() -> Result<Vec<SearchItem>, String> {
    let cached = APPS.lock().unwrap_or_else(|e| e.into_inner()).clone();
    match cached {
        Some(items) => {
            refresh_apps();
            Ok(items)
        }
        None => read_apps(),
    }
}

#[tauri::command(async)]
pub fn search_files(query: String, ticket: u64) -> Result<Vec<SearchItem>, String> {
    TICKETS.issue(ticket);
    let found = on_com_thread(move || files::find(&query, || TICKETS.is_current(ticket)))??;
    let mut known = KNOWN.lock().unwrap_or_else(|e| e.into_inner());
    Ok(found
        .into_iter()
        .map(|path| {
            let item = SearchItem {
                id: format!("file:{path}"),
                name: files::file_name(&path).to_string(),
                kind: "file",
                detail: Some(files::folder_of(&path).to_string()),
            };
            known.remember(&item, &path);
            item
        })
        .collect())
}

/// Nothing is stored for this: it's Windows' own list of what was opened.
#[tauri::command(async)]
pub fn search_recent_files() -> Vec<SearchItem> {
    let mut known = KNOWN.lock().unwrap_or_else(|e| e.into_inner());
    files::recent()
        .into_iter()
        .map(|path| {
            let item = SearchItem { id: format!("file:{path}"), name: files::recent_name(files::file_name(&path)).to_string(), kind: "file", detail: None };
            known.remember(&item, &path);
            item
        })
        .collect()
}

#[tauri::command(async)]
pub fn search_forget_file(id: String) -> Result<(), String> {
    crate::preview::guard()?;
    let target = KNOWN.lock().unwrap_or_else(|e| e.into_inner()).target(&id).ok_or("unknown item")?;
    files::forget(&target)
}

fn shell_open(target: &str) {
    unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from(target), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
    }
}

#[tauri::command(async)]
pub fn search_open(id: String) -> Result<(), String> {
    crate::preview::guard()?;
    let target = KNOWN.lock().unwrap_or_else(|e| e.into_inner()).target(&id).ok_or("unknown item")?;
    shell_open(&target);
    Ok(())
}

#[tauri::command(async)]
pub fn search_web(query: String) -> Result<(), String> {
    crate::preview::guard()?;
    shell_open(&web_url(&query));
    Ok(())
}

#[tauri::command(async)]
pub fn search_icon(id: String) -> Option<String> {
    let target = KNOWN.lock().unwrap_or_else(|e| e.into_inner()).target(&id)?;
    icon_of_exe(target).ok().flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str) -> SearchItem {
        SearchItem { id: id.into(), name: "x".into(), kind: "app", detail: None }
    }

    #[test]
    fn only_ids_it_returned_can_be_opened() {
        let mut known = Known::default();
        known.remember(&item("app:paint"), "shell:AppsFolder\\paint");
        assert_eq!(known.target("app:paint"), Some("shell:AppsFolder\\paint".to_string()));
        assert_eq!(known.target("calc.exe"), None);
        assert_eq!(known.target("C:\\Windows\\System32\\cmd.exe"), None);
    }

    #[test]
    fn a_new_ticket_makes_older_searches_stop() {
        let tickets = Tickets::default();
        tickets.issue(1);
        assert!(tickets.is_current(1));
        tickets.issue(2);
        assert!(!tickets.is_current(1));
        assert!(tickets.is_current(2));
    }

    #[test]
    fn a_late_old_ticket_cant_take_over() {
        let tickets = Tickets::default();
        tickets.issue(5);
        tickets.issue(4);
        assert!(tickets.is_current(5));
        assert!(!tickets.is_current(4));
    }

    #[test]
    fn the_web_address_is_built_here_and_the_text_is_encoded() {
        assert_eq!(web_url("a b"), "https://www.google.com/search?q=a%20b");
        assert_eq!(web_url("x&y=z#h"), "https://www.google.com/search?q=x%26y%3Dz%23h");
        assert_eq!(web_url("é"), "https://www.google.com/search?q=%C3%A9");
        assert_eq!(web_url("https://evil.example/"), "https://www.google.com/search?q=https%3A%2F%2Fevil.example%2F");
    }
}
