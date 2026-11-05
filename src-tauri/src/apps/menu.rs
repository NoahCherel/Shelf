//! Right-click on an app shows what a Windows taskbar button offers: open, pin, end, close. It's a
//! real Windows menu, built here rather than borrowed from the app's file, which would be File
//! Explorer's menu for a shortcut.

use ::windows::core::{w, HSTRING, PCWSTR};
use ::windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, POINT, WPARAM};
use ::windows::Win32::Globalization::GetUserDefaultUILanguage;
use ::windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
use ::windows::Win32::UI::Shell::ShellExecuteW;
use ::windows::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, DestroyMenu, GetCursorPos, PostMessageW, TrackPopupMenuEx, MF_SEPARATOR, MF_STRING, SW_SHOWNORMAL, TPM_BOTTOMALIGN,
    TPM_RETURNCMD, TPM_RIGHTBUTTON, WM_CLOSE, WM_NULL,
};

use super::merge::AppEntry;
use super::pins;
use super::windows;

/// A click that closes Start arrives this soon after it closed.
const START_REOPEN_GUARD_MS: u64 = 400;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Own {
    Open,
    Pin,
    Unpin,
    EndTask,
    Close,
    CloseAll,
}

fn file_name(path: &str) -> &str {
    path.rsplit(['\\', '/']).next().unwrap_or(path)
}

/// Ending these would take the desktop or every store app down with them.
pub fn can_end_task(exe: &str) -> bool {
    let name = file_name(exe);
    !name.is_empty() && !name.eq_ignore_ascii_case("explorer.exe") && !name.eq_ignore_ascii_case("ApplicationFrameHost.exe")
}

/// In Windows' order: the app, its pin, then what acts on what's open.
pub fn items(pinned: bool, windows: usize, can_end: bool) -> Vec<Own> {
    let mut list = vec![Own::Open, if pinned { Own::Unpin } else { Own::Pin }];
    if windows > 0 && can_end {
        list.push(Own::EndTask);
    }
    match windows {
        0 => {}
        1 => list.push(Own::Close),
        _ => list.push(Own::CloseAll),
    }
    list
}

/// Windows' own words, so the menu reads as it would on the taskbar. `lang` is a Windows language id.
/// Open is labelled with the app's name.
pub fn label(item: Own, lang: u16) -> &'static str {
    let french = lang & 0x3FF == 0x0C;
    match (item, french) {
        (Own::Open, _) => "",
        (Own::Pin, true) => "Épingler à la barre des tâches",
        (Own::Pin, false) => "Pin to taskbar",
        (Own::Unpin, true) => "Détacher de la barre des tâches",
        (Own::Unpin, false) => "Unpin from taskbar",
        (Own::EndTask, true) => "Fin de tâche",
        (Own::EndTask, false) => "End task",
        (Own::Close, true) => "Fermer la fenêtre",
        (Own::Close, false) => "Close window",
        (Own::CloseAll, true) => "Fermer toutes les fenêtres",
        (Own::CloseAll, false) => "Close all windows",
    }
}

const ALL: [Own; 6] = [Own::Open, Own::Pin, Own::Unpin, Own::EndTask, Own::Close, Own::CloseAll];

fn own_id(item: Own) -> u32 {
    ALL.iter().position(|i| *i == item).map_or(0, |p| p as u32 + 1)
}

pub fn chosen(id: u32) -> Option<Own> {
    id.checked_sub(1).and_then(|i| ALL.get(i as usize)).copied()
}

pub fn should_press_start(open_now: bool, since_closed_ms: Option<u64>) -> bool {
    open_now || !since_closed_ms.is_some_and(|ms| ms < START_REOPEN_GUARD_MS)
}

pub fn is_start_host(exe: &str) -> bool {
    let name = file_name(exe);
    name.eq_ignore_ascii_case("SearchHost.exe") || name.eq_ignore_ascii_case("StartMenuExperienceHost.exe")
}

unsafe fn end_task(entry: &AppEntry) {
    for window in &entry.windows {
        if let Ok(process) = OpenProcess(PROCESS_TERMINATE, false, windows::pid_of(window.hwnd)) {
            let _ = TerminateProcess(process, 1);
            let _ = CloseHandle(process);
        }
    }
}

/// Runs on the main thread, whose message loop the menu borrows until it closes.
pub fn show(dock_raw: isize, entry: &AppEntry, saved: impl Fn(serde_json::Value)) {
    let owner = HWND(dock_raw as *mut _);
    let previous = windows::foreground();
    let can_end = entry.windows.iter().all(|w| can_end_task(&windows::exe_of(w.hwnd)));
    unsafe {
        let Ok(menu) = CreatePopupMenu() else { return };
        let lang = GetUserDefaultUILanguage();
        for item in items(entry.pinned, entry.windows.len(), can_end) {
            if matches!(item, Own::EndTask) || (matches!(item, Own::Close | Own::CloseAll) && !can_end) {
                let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
            }
            let text = if item == Own::Open { entry.name.as_str() } else { label(item, lang) };
            let _ = AppendMenuW(menu, MF_STRING, own_id(item) as usize, &HSTRING::from(text));
        }

        let mut at = POINT::default();
        let _ = GetCursorPos(&mut at);
        // A menu only closes on an outside click if its owner holds the foreground.
        windows::take_foreground_raw(dock_raw);
        let id = TrackPopupMenuEx(menu, (TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_BOTTOMALIGN).0, at.x, at.y, owner, None).0 as u32;
        let _ = PostMessageW(Some(owner), WM_NULL, WPARAM(0), LPARAM(0));
        let _ = DestroyMenu(menu);

        let close_all = || {
            for window in &entry.windows {
                let _ = PostMessageW(Some(HWND(window.hwnd as *mut _)), WM_CLOSE, WPARAM(0), LPARAM(0));
            }
        };
        match chosen(id) {
            Some(Own::Open) => {
                if let Some(path) = &entry.launch {
                    ShellExecuteW(None, w!("open"), &HSTRING::from(path), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
                }
            }
            Some(Own::Pin) => saved(pins::pin(entry)),
            Some(Own::Unpin) => saved(pins::unpin(&entry.key)),
            Some(Own::EndTask) => end_task(entry),
            Some(Own::Close | Own::CloseAll) => {
                close_all();
                windows::take_foreground_raw(previous);
            }
            None => windows::take_foreground_raw(previous),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRENCH: u16 = 0x040C;
    const ENGLISH: u16 = 0x0409;

    #[test]
    fn an_open_pinned_app_offers_what_a_taskbar_button_does() {
        assert_eq!(items(true, 1, true), vec![Own::Open, Own::Unpin, Own::EndTask, Own::Close]);
    }

    #[test]
    fn an_open_app_that_isnt_pinned_can_be_pinned() {
        assert_eq!(items(false, 1, true), vec![Own::Open, Own::Pin, Own::EndTask, Own::Close]);
    }

    #[test]
    fn several_windows_close_together() {
        assert_eq!(items(true, 3, true), vec![Own::Open, Own::Unpin, Own::EndTask, Own::CloseAll]);
    }

    #[test]
    fn a_pinned_app_that_isnt_open_can_only_be_opened_or_unpinned() {
        assert_eq!(items(true, 0, false), vec![Own::Open, Own::Unpin]);
    }

    #[test]
    fn apps_that_must_not_be_killed_offer_no_end_task() {
        assert_eq!(items(true, 1, false), vec![Own::Open, Own::Unpin, Own::Close]);
    }

    #[test]
    fn ending_explorer_or_the_store_host_would_take_other_things_with_it() {
        assert!(!can_end_task(r"C:\Windows\explorer.exe"));
        assert!(!can_end_task(r"C:\WINDOWS\Explorer.EXE"));
        assert!(!can_end_task(r"C:\Windows\System32\ApplicationFrameHost.exe"));
        assert!(!can_end_task(""));
        assert!(can_end_task(r"C:\Program Files\Mozilla Firefox\firefox.exe"));
    }

    #[test]
    fn labels_follow_the_windows_language() {
        assert_eq!(label(Own::Pin, FRENCH), "Épingler à la barre des tâches");
        assert_eq!(label(Own::Unpin, FRENCH), "Détacher de la barre des tâches");
        assert_eq!(label(Own::EndTask, FRENCH), "Fin de tâche");
        assert_eq!(label(Own::Close, FRENCH), "Fermer la fenêtre");
        assert_eq!(label(Own::CloseAll, FRENCH), "Fermer toutes les fenêtres");
        assert_eq!(label(Own::Pin, ENGLISH), "Pin to taskbar");
        assert_eq!(label(Own::Close, 0x0407), "Close window");
    }

    #[test]
    fn each_menu_id_is_its_own_item() {
        assert_eq!(chosen(0), None);
        for item in [Own::Open, Own::Pin, Own::Unpin, Own::EndTask, Own::Close, Own::CloseAll] {
            assert_eq!(chosen(own_id(item)), Some(item));
        }
        assert_eq!(chosen(9999), None);
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
