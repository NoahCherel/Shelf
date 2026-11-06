//! What right-clicking an app offers, as a Windows taskbar button does: open, pin, close. The menu
//! itself is drawn by the page. This decides what's in it and runs what's chosen.

use serde::Serialize;

use super::jumplist::{fingerprint, Link};
use super::merge::AppEntry;

/// A click that closes Start arrives this soon after it closed.
const START_REOPEN_GUARD_MS: u64 = 400;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Own {
    Open,
    Pin,
    Unpin,
    Close,
    CloseAll,
}

#[derive(Serialize)]
pub struct Row {
    id: String,
    label: String,
}

/// A titled part of a jump list, as Windows shows above a taskbar button's own items.
#[derive(Serialize)]
pub struct Section {
    title: String,
    items: Vec<Row>,
}

#[derive(Serialize)]
pub struct AppMenu {
    sections: Vec<Section>,
    items: Vec<Row>,
}

const JUMP: &str = "jump:";

/// A choice from a jump list is a fingerprint and nothing else: anything else is refused.
pub fn jump_from(id: &str) -> Option<&str> {
    id.strip_prefix(JUMP).filter(|print| print.len() == 16 && print.bytes().all(|b| b.is_ascii_hexdigit()))
}

fn file_name(path: &str) -> &str {
    path.rsplit(['\\', '/']).next().unwrap_or(path)
}

/// In Windows' order: the app, its pin, then closing what's open.
pub fn items(pinned: bool, windows: usize) -> Vec<Own> {
    let mut list = vec![Own::Open, if pinned { Own::Unpin } else { Own::Pin }];
    match windows {
        0 => {}
        1 => list.push(Own::Close),
        _ => list.push(Own::CloseAll),
    }
    list
}

/// Windows' own words, so the menu reads as it would on the taskbar. `lang` is a Windows language id.
/// Open is labelled with the app's name instead.
pub fn label(item: Own, lang: u16) -> &'static str {
    let french = lang & 0x3FF == 0x0C;
    match (item, french) {
        (Own::Open, _) => "",
        (Own::Pin, true) => "Épingler à la barre des tâches",
        (Own::Pin, false) => "Pin to taskbar",
        (Own::Unpin, true) => "Détacher de la barre des tâches",
        (Own::Unpin, false) => "Unpin from taskbar",
        (Own::Close, true) => "Fermer la fenêtre",
        (Own::Close, false) => "Close window",
        (Own::CloseAll, true) => "Fermer toutes les fenêtres",
        (Own::CloseAll, false) => "Close all windows",
    }
}

fn own_id(item: Own) -> &'static str {
    match item {
        Own::Open => "open",
        Own::Pin => "pin",
        Own::Unpin => "unpin",
        Own::Close => "close",
        Own::CloseAll => "close-all",
    }
}

/// Only these, whatever the page asks.
pub fn own_from(id: &str) -> Option<Own> {
    [Own::Open, Own::Pin, Own::Unpin, Own::Close, Own::CloseAll].into_iter().find(|item| own_id(*item) == id)
}

/// `lists` are the jump list's sections, titled and in order.
pub fn menu_for(entry: &AppEntry, lang: u16, lists: Vec<(String, Vec<Link>)>) -> AppMenu {
    AppMenu {
        sections: lists
            .into_iter()
            .filter(|(_, links)| !links.is_empty())
            .map(|(title, links)| Section {
                title,
                items: links.iter().map(|l| Row { id: format!("{JUMP}{}", fingerprint(l)), label: l.title.clone() }).collect(),
            })
            .collect(),
        items: items(entry.pinned, entry.windows.len())
            .into_iter()
            .map(|item| Row { id: own_id(item).to_string(), label: if item == Own::Open { entry.name.clone() } else { label(item, lang).to_string() } })
            .collect(),
    }
}

pub fn should_press_start(open_now: bool, since_closed_ms: Option<u64>) -> bool {
    open_now || !since_closed_ms.is_some_and(|ms| ms < START_REOPEN_GUARD_MS)
}

pub fn is_start_host(exe: &str) -> bool {
    let name = file_name(exe);
    name.eq_ignore_ascii_case("SearchHost.exe") || name.eq_ignore_ascii_case("StartMenuExperienceHost.exe")
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRENCH: u16 = 0x040C;
    const ENGLISH: u16 = 0x0409;

    #[test]
    fn an_open_pinned_app_offers_what_a_taskbar_button_does() {
        assert_eq!(items(true, 1), vec![Own::Open, Own::Unpin, Own::Close]);
    }

    #[test]
    fn an_open_app_that_isnt_pinned_can_be_pinned() {
        assert_eq!(items(false, 1), vec![Own::Open, Own::Pin, Own::Close]);
    }

    #[test]
    fn several_windows_close_together() {
        assert_eq!(items(true, 3), vec![Own::Open, Own::Unpin, Own::CloseAll]);
    }

    #[test]
    fn a_pinned_app_that_isnt_open_can_only_be_opened_or_unpinned() {
        assert_eq!(items(true, 0), vec![Own::Open, Own::Unpin]);
    }

    #[test]
    fn labels_follow_the_windows_language() {
        assert_eq!(label(Own::Pin, FRENCH), "Épingler à la barre des tâches");
        assert_eq!(label(Own::Unpin, FRENCH), "Détacher de la barre des tâches");
        assert_eq!(label(Own::Close, FRENCH), "Fermer la fenêtre");
        assert_eq!(label(Own::CloseAll, FRENCH), "Fermer toutes les fenêtres");
        assert_eq!(label(Own::Pin, ENGLISH), "Pin to taskbar");
        assert_eq!(label(Own::Close, 0x0407), "Close window");
    }

    #[test]
    fn only_known_choices_run_whatever_the_page_asks() {
        for item in [Own::Open, Own::Pin, Own::Unpin, Own::Close, Own::CloseAll] {
            assert_eq!(own_from(own_id(item)), Some(item));
        }
        assert_eq!(own_from("end-task"), None, "there's no ending tasks from here");
        assert_eq!(own_from("calc.exe"), None);
    }

    fn app(pinned: bool) -> AppEntry {
        AppEntry { key: "firefox".into(), name: "Firefox".into(), pinned, active: false, windows: Vec::new(), launch: None, icon_source: None }
    }

    #[test]
    fn jump_lists_come_first_under_their_titles_and_empty_ones_are_left_out() {
        let tasks = vec![Link { title: "New private window".into(), path: "firefox.exe".into(), args: "-private-window".into() }];
        let menu = menu_for(&app(true), FRENCH, vec![("Tâches".into(), tasks.clone()), ("Récent".into(), Vec::new())]);
        assert_eq!(menu.sections.len(), 1);
        assert_eq!(menu.sections[0].title, "Tâches");
        assert_eq!(menu.sections[0].items[0].label, "New private window");
        assert_eq!(menu.sections[0].items[0].id, format!("jump:{}", fingerprint(&tasks[0])));
        assert_eq!(menu.items[0].label, "Firefox", "the app's own items stay below");
    }

    #[test]
    fn a_choice_from_a_jump_list_is_only_a_fingerprint() {
        assert_eq!(jump_from("jump:0123456789abcdef"), Some("0123456789abcdef"));
        assert_eq!(jump_from("jump:calc.exe"), None);
        assert_eq!(jump_from("pin"), None);
    }

    #[test]
    fn nothing_in_the_menu_can_kill_a_process() {
        let source = include_str!("menu.rs");
        let code = &source[..source.find("#[cfg(test)]").unwrap()];
        assert!(!code.contains("TerminateProcess"));
    }

    #[test]
    fn pressing_start_toggles_it_like_the_real_button() {
        assert!(should_press_start(false, None), "closed: opens");
        assert!(should_press_start(true, None), "open: the key closes it");
        assert!(!should_press_start(false, Some(120)), "this very click just closed it: stay closed");
        assert!(should_press_start(false, Some(2000)), "closed a while ago: opens");
    }

    #[test]
    fn start_is_recognised_by_its_host() {
        assert!(is_start_host(r"C:\Windows\SystemApps\X\SearchHost.exe"));
        assert!(is_start_host(r"C:\Windows\SystemApps\X\StartMenuExperienceHost.exe"));
        assert!(!is_start_host(r"C:\Program Files\Mozilla Firefox\firefox.exe"));
    }
}
