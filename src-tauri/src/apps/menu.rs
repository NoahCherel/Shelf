//! What right-clicking an app offers, as a Windows taskbar button does: open, pin, close. The menu
//! itself is drawn by the page. This decides what's in it and runs what's chosen.

use serde::Serialize;

use super::jumplist::{fingerprint, Link};
use super::merge::{AppEntry, AppKind};

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Own {
    Open,
    Pin,
    Unpin,
    Close,
    CloseAll,
    Remove,
    Ungroup,
    LeaveGroup,
}

#[derive(Serialize)]
pub struct Row {
    id: String,
    label: String,
    /// Shown on hover, as Windows does for a jump list's lines.
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
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

/// The id of a jump list's line, which is all the page ever sends back.
pub fn jump_id(link: &Link) -> String {
    format!("{JUMP}{}", fingerprint(link))
}

/// A choice from a jump list is a fingerprint and nothing else: anything else is refused.
pub fn jump_from(id: &str) -> Option<&str> {
    id.strip_prefix(JUMP).filter(|print| print.len() == 16 && print.bytes().all(|b| b.is_ascii_hexdigit()))
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

/// What this tile offers, by what it is.
pub fn items_for(entry: &AppEntry) -> Vec<Own> {
    match entry.kind {
        AppKind::File | AppKind::Folder => vec![Own::Open, Own::Remove],
        AppKind::Group => vec![Own::Open, Own::Ungroup],
        AppKind::App if entry.grouped => items(true, entry.windows.len()).into_iter().map(|item| if item == Own::Unpin { Own::LeaveGroup } else { item }).collect(),
        AppKind::App => items(entry.pinned, entry.windows.len()),
    }
}

/// Windows' own words, so the menu reads as it would on the taskbar. `lang` is a Windows language id.
/// Open is labelled with the app's name instead.
pub fn label(item: Own, lang: u16) -> &'static str {
    let french = crate::util::is_french(lang);
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
        (Own::Remove, true) => "Retirer du dock",
        (Own::Remove, false) => "Remove from dock",
        (Own::Ungroup, true) => "Défaire le groupe",
        (Own::Ungroup, false) => "Ungroup",
        (Own::LeaveGroup, true) => "Sortir du groupe",
        (Own::LeaveGroup, false) => "Remove from group",
    }
}

fn own_id(item: Own) -> &'static str {
    match item {
        Own::Open => "open",
        Own::Pin => "pin",
        Own::Unpin => "unpin",
        Own::Close => "close",
        Own::CloseAll => "close-all",
        Own::Remove => "remove",
        Own::Ungroup => "ungroup",
        Own::LeaveGroup => "leave-group",
    }
}

/// Only these, whatever the page asks.
pub fn own_from(id: &str) -> Option<Own> {
    [Own::Open, Own::Pin, Own::Unpin, Own::Close, Own::CloseAll, Own::Remove, Own::Ungroup, Own::LeaveGroup].into_iter().find(|item| own_id(*item) == id)
}

/// `lists` are the jump list's sections, titled and in order.
pub fn menu_for(entry: &AppEntry, lang: u16, lists: Vec<(String, Vec<Link>)>) -> AppMenu {
    AppMenu {
        sections: lists
            .into_iter()
            .filter(|(_, links)| !links.is_empty())
            .map(|(title, links)| Section {
                title,
                items: links
                    .iter()
                    .map(|l| Row { id: jump_id(l), label: l.title.clone(), detail: Some(l.detail.clone()).filter(|d| !d.is_empty()) })
                    .collect(),
            })
            .collect(),
        items: items_for(entry)
            .into_iter()
            .map(|item| Row { id: own_id(item).to_string(), label: if item == Own::Open { entry.name.clone() } else { label(item, lang).to_string() }, detail: None })
            .collect(),
    }
}

/// The bubble above the dock during a drag, in Windows' language. Only these, whatever the page asks.
pub fn hint_text(what: &str, lang: u16, name: &str) -> Option<String> {
    let french = crate::util::is_french(lang);
    match (what, french) {
        ("add", true) => Some("Ajouter au dock".to_string()),
        ("add", false) => Some("Add to dock".to_string()),
        ("remove", _) => Some(label(Own::Remove, lang).to_string()),
        ("open", true) => Some(format!("Ouvrir dans {name}")),
        ("open", false) => Some(format!("Open in {name}")),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::apps::merge::AppKind;

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
        AppEntry { key: "firefox".into(), name: "Firefox".into(), pinned, active: false, windows: Vec::new(), launch: None, icon_source: None, ..Default::default() }
    }

    fn of_kind(kind: AppKind, grouped: bool, windows: usize) -> AppEntry {
        AppEntry { kind, grouped, windows: (0..windows).map(|i| crate::apps::merge::AppWindow { hwnd: i as isize, title: String::new() }).collect(), ..app(true) }
    }

    #[test]
    fn each_kind_of_thing_on_the_dock_offers_what_fits_it() {
        assert_eq!(items_for(&of_kind(AppKind::File, false, 0)), vec![Own::Open, Own::Remove]);
        assert_eq!(items_for(&of_kind(AppKind::Folder, false, 0)), vec![Own::Open, Own::Remove]);
        assert_eq!(items_for(&of_kind(AppKind::Group, false, 2)), vec![Own::Open, Own::Ungroup]);
        assert_eq!(items_for(&of_kind(AppKind::App, true, 0)), vec![Own::Open, Own::LeaveGroup]);
        assert_eq!(items_for(&of_kind(AppKind::App, true, 1)), vec![Own::Open, Own::LeaveGroup, Own::Close]);
        assert_eq!(items_for(&of_kind(AppKind::App, false, 0)), vec![Own::Open, Own::Unpin]);
    }

    #[test]
    fn the_new_choices_are_named_and_accepted() {
        assert_eq!(label(Own::Remove, FRENCH), "Retirer du dock");
        assert_eq!(label(Own::Ungroup, ENGLISH), "Ungroup");
        assert_eq!(label(Own::LeaveGroup, FRENCH), "Sortir du groupe");
        for item in [Own::Remove, Own::Ungroup, Own::LeaveGroup] {
            assert_eq!(own_from(own_id(item)), Some(item));
        }
    }

    #[test]
    fn the_bubbles_during_a_drag_speak_windows_language() {
        assert_eq!(hint_text("add", FRENCH, ""), Some("Ajouter au dock".to_string()));
        assert_eq!(hint_text("remove", FRENCH, ""), Some("Retirer du dock".to_string()));
        assert_eq!(hint_text("open", FRENCH, "Word"), Some("Ouvrir dans Word".to_string()));
        assert_eq!(hint_text("add", ENGLISH, ""), Some("Add to dock".to_string()));
        assert_eq!(hint_text("open", ENGLISH, "Word"), Some("Open in Word".to_string()));
        assert_eq!(hint_text("calc.exe", FRENCH, ""), None);
    }

    #[test]
    fn jump_lists_come_first_under_their_titles_and_empty_ones_are_left_out() {
        let tasks = vec![Link { title: "New private window".into(), path: "firefox.exe".into(), args: "-private-window".into(), detail: "Opens a private window".into(), ..Default::default() }];
        let menu = menu_for(&app(true), FRENCH, vec![("Tâches".into(), tasks.clone()), ("Récent".into(), Vec::new())]);
        assert_eq!(menu.sections.len(), 1);
        assert_eq!(menu.sections[0].title, "Tâches");
        assert_eq!(menu.sections[0].items[0].label, "New private window");
        assert_eq!(menu.sections[0].items[0].id, format!("jump:{}", fingerprint(&tasks[0])));
        assert_eq!(menu.sections[0].items[0].detail.as_deref(), Some("Opens a private window"));
        assert_eq!(menu.items[0].detail, None);
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
}
