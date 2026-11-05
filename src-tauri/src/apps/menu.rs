//! Right-click on an app shows Windows' own menu for it, plus what a taskbar button adds.

use std::cell::RefCell;

use ::windows::core::{w, Interface, HSTRING, PCSTR, PCWSTR};
use ::windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, LRESULT, POINT, WPARAM};
use ::windows::Win32::Globalization::GetUserDefaultUILanguage;
use ::windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
use ::windows::Win32::UI::Shell::{
    BHID_SFUIObject, IContextMenu, IContextMenu3, IShellItem, SHCreateItemFromParsingName, ShellExecuteW,
    CMF_NORMAL, CMINVOKECOMMANDINFO,
};
use ::windows::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, DestroyMenu, GetCursorPos, PostMessageW, TrackPopupMenuEx, HMENU, MF_SEPARATOR,
    MF_STRING, SW_SHOWNORMAL, TPM_BOTTOMALIGN, TPM_RETURNCMD, TPM_RIGHTBUTTON, WM_CLOSE, WM_DRAWITEM,
    WM_INITMENUPOPUP, WM_MEASUREITEM, WM_MENUCHAR, WM_NULL,
};

use super::merge::AppEntry;
use super::windows;

/// Menu ids: the shell's items count up from here, and ours sit above anything it could use.
const SHELL_FIRST: u32 = 1;
const SHELL_LAST: u32 = 0x6FFF;
const OWN_FIRST: u32 = 0x7000;

/// A click that closes Start arrives this soon after it closed.
const START_REOPEN_GUARD_MS: u64 = 400;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Own {
    TaskManager,
    EndTask,
    Close,
}

#[derive(PartialEq, Debug)]
pub enum Chosen {
    Nothing,
    Shell(u32),
    Own(Own),
}

fn file_name(path: &str) -> &str {
    path.rsplit(['\\', '/']).next().unwrap_or(path)
}

/// Ending these would take the desktop or every store app down with them.
pub fn can_end_task(exe: &str) -> bool {
    let name = file_name(exe);
    !name.is_empty() && !name.eq_ignore_ascii_case("explorer.exe") && !name.eq_ignore_ascii_case("ApplicationFrameHost.exe")
}

pub fn own_items(has_windows: bool, can_end: bool) -> Vec<Own> {
    let mut items = vec![Own::TaskManager];
    if has_windows && can_end {
        items.push(Own::EndTask);
    }
    if has_windows {
        items.push(Own::Close);
    }
    items
}

/// The shell's items come in Windows' language, so ours follow it. `lang` is a Windows language id.
pub fn label(item: Own, lang: u16) -> &'static str {
    let french = lang & 0x3FF == 0x0C;
    match (item, french) {
        (Own::TaskManager, true) => "Gestionnaire des tâches",
        (Own::TaskManager, false) => "Task Manager",
        (Own::EndTask, true) => "Fin de tâche",
        (Own::EndTask, false) => "End task",
        (Own::Close, true) => "Fermer la fenêtre",
        (Own::Close, false) => "Close window",
    }
}

fn own_id(item: Own) -> u32 {
    OWN_FIRST
        + match item {
            Own::TaskManager => 0,
            Own::EndTask => 1,
            Own::Close => 2,
        }
}

pub fn chosen(id: u32) -> Chosen {
    match id {
        0 => Chosen::Nothing,
        id if id == own_id(Own::TaskManager) => Chosen::Own(Own::TaskManager),
        id if id == own_id(Own::EndTask) => Chosen::Own(Own::EndTask),
        id if id == own_id(Own::Close) => Chosen::Own(Own::Close),
        id => Chosen::Shell(id - SHELL_FIRST),
    }
}

pub fn should_press_start(open_now: bool, since_closed_ms: Option<u64>) -> bool {
    open_now || !since_closed_ms.is_some_and(|ms| ms < START_REOPEN_GUARD_MS)
}

pub fn is_start_host(exe: &str) -> bool {
    let name = file_name(exe);
    name.eq_ignore_ascii_case("SearchHost.exe") || name.eq_ignore_ascii_case("StartMenuExperienceHost.exe")
}

thread_local! {
    /// The open menu's shell handler. Its submenus and icons draw themselves through it.
    static OPEN_MENU: RefCell<Option<IContextMenu3>> = const { RefCell::new(None) };
}

/// Called from the dock's message handler, which owns the menu. Some(result) means it was handled.
pub fn forward(msg: u32, wparam: WPARAM, lparam: LPARAM) -> Option<LRESULT> {
    if !matches!(msg, WM_INITMENUPOPUP | WM_DRAWITEM | WM_MEASUREITEM | WM_MENUCHAR) {
        return None;
    }
    OPEN_MENU.with_borrow(|open| {
        let handler = open.as_ref()?;
        let mut result = LRESULT(0);
        unsafe { handler.HandleMenuMsg2(msg, wparam, lparam, Some(&mut result)).ok()? };
        Some(result)
    })
}

/// Fills the menu with Windows' own items for this app, when it has some to offer.
unsafe fn add_shell_items(menu: HMENU, source: &str) -> Option<IContextMenu> {
    let item: IShellItem = SHCreateItemFromParsingName(&HSTRING::from(source), None).ok()?;
    let handler: IContextMenu = item.BindToHandler(None, &BHID_SFUIObject).ok()?;
    handler.QueryContextMenu(menu, 0, SHELL_FIRST, SHELL_LAST, CMF_NORMAL).ok().ok()?;
    Some(handler)
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
pub fn show(dock_raw: isize, entry: &AppEntry) {
    let owner = HWND(dock_raw as *mut _);
    let previous = windows::foreground();
    let can_end = entry.windows.iter().all(|w| can_end_task(&windows::exe_of(w.hwnd)));
    unsafe {
        let Ok(menu) = CreatePopupMenu() else { return };
        let shell = entry.icon_source.as_deref().and_then(|source| add_shell_items(menu, source));
        if shell.is_some() {
            let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
        }
        let lang = GetUserDefaultUILanguage();
        for item in own_items(!entry.windows.is_empty(), can_end) {
            let _ = AppendMenuW(menu, MF_STRING, own_id(item) as usize, &HSTRING::from(label(item, lang)));
        }
        OPEN_MENU.with_borrow_mut(|open| *open = shell.as_ref().and_then(|s| s.cast().ok()));

        let mut at = POINT::default();
        let _ = GetCursorPos(&mut at);
        // A menu only closes on an outside click if its owner holds the foreground.
        windows::take_foreground_raw(dock_raw);
        let id = TrackPopupMenuEx(menu, (TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_BOTTOMALIGN).0, at.x, at.y, owner, None).0 as u32;
        let _ = PostMessageW(Some(owner), WM_NULL, WPARAM(0), LPARAM(0));
        OPEN_MENU.with_borrow_mut(|open| *open = None);

        match chosen(id) {
            Chosen::Nothing => windows::take_foreground_raw(previous),
            Chosen::Shell(offset) => {
                if let Some(handler) = &shell {
                    let info = CMINVOKECOMMANDINFO {
                        cbSize: std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32,
                        hwnd: owner,
                        // The API takes a small number here, in the place of a verb's name.
                        lpVerb: PCSTR(offset as usize as *const u8),
                        nShow: SW_SHOWNORMAL.0,
                        ..Default::default()
                    };
                    let _ = handler.InvokeCommand(&info);
                }
            }
            Chosen::Own(Own::TaskManager) => {
                ShellExecuteW(None, w!("open"), w!("taskmgr.exe"), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
            }
            Chosen::Own(Own::EndTask) => end_task(entry),
            Chosen::Own(Own::Close) => {
                for window in &entry.windows {
                    let _ = PostMessageW(Some(HWND(window.hwnd as *mut _)), WM_CLOSE, WPARAM(0), LPARAM(0));
                }
                windows::take_foreground_raw(previous);
            }
        }
        let _ = DestroyMenu(menu);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRENCH: u16 = 0x040C;
    const ENGLISH: u16 = 0x0409;

    #[test]
    fn an_open_app_can_be_closed_or_ended() {
        let items = own_items(true, true);
        assert_eq!(items, vec![Own::TaskManager, Own::EndTask, Own::Close]);
    }

    #[test]
    fn a_closed_app_only_offers_task_manager() {
        assert_eq!(own_items(false, false), vec![Own::TaskManager]);
    }

    #[test]
    fn apps_that_must_not_be_killed_offer_no_end_task() {
        assert_eq!(own_items(true, false), vec![Own::TaskManager, Own::Close]);
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
        assert_eq!(label(Own::TaskManager, FRENCH), "Gestionnaire des tâches");
        assert_eq!(label(Own::EndTask, FRENCH), "Fin de tâche");
        assert_eq!(label(Own::Close, FRENCH), "Fermer la fenêtre");
        assert_eq!(label(Own::TaskManager, ENGLISH), "Task Manager");
        assert_eq!(label(Own::Close, 0x0407), "Close window");
    }

    #[test]
    fn menu_ids_tell_the_shell_and_our_own_items_apart() {
        assert_eq!(chosen(0), Chosen::Nothing);
        assert_eq!(chosen(SHELL_FIRST + 4), Chosen::Shell(4));
        assert_eq!(chosen(OWN_FIRST), Chosen::Own(Own::TaskManager));
        assert_eq!(chosen(OWN_FIRST + 1), Chosen::Own(Own::EndTask));
        assert_eq!(chosen(OWN_FIRST + 2), Chosen::Own(Own::Close));
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
