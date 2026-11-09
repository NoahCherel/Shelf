//! Any installed app or folder as a widget of its own. What a widget opens comes from its id, and
//! only an id saved in the layout can open anything.

use serde::Serialize;
use tauri::{AppHandle, Manager};
use windows::core::{w, HSTRING, PCWSTR};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, ShellExecuteW, FOS_PICKFOLDERS, SIGDN_FILESYSPATH};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use super::{icon_of_exe, on_com_thread};

#[derive(Debug, PartialEq)]
pub enum Pinned {
    App(String),
    Folder(String),
}

/// What a widget's id stands for. Ids hold forward slashes; Windows wants backslashes.
pub fn parse(id: &str) -> Option<Pinned> {
    let rest = id.strip_prefix("pin:")?;
    let (kind, target) = rest.split_once(':')?;
    let target = target.replace('/', r"\");
    match (kind, target.is_empty()) {
        ("app", false) => Some(Pinned::App(target)),
        ("folder", false) => Some(Pinned::Folder(target)),
        _ => None,
    }
}

fn target_of(pinned: &Pinned) -> String {
    match pinned {
        Pinned::App(parsing) => format!(r"shell:AppsFolder\{parsing}"),
        Pinned::Folder(path) => path.clone(),
    }
}

fn in_layout(saved: Option<&serde_json::Value>, id: &str) -> bool {
    saved.and_then(|s| s["ids"].as_array()).is_some_and(|ids| ids.iter().any(|i| i.as_str() == Some(id)))
}

/// Gone only once the list of apps is known and it isn't on it, or the folder has gone.
fn is_gone(pinned: &Pinned, listed: Option<Option<String>>, is_dir: impl Fn(&str) -> bool) -> bool {
    match pinned {
        Pinned::App(_) => matches!(listed, Some(None)),
        Pinned::Folder(path) => !is_dir(path),
    }
}

#[derive(Serialize)]
pub struct Info {
    name: String,
    gone: bool,
}

#[tauri::command(async)]
pub fn pin_widget_info(id: String) -> Result<Info, String> {
    let pinned = parse(&id).ok_or("not a widget of that kind")?;
    let listed = match &pinned {
        Pinned::App(parsing) => crate::search::listed_name(parsing),
        Pinned::Folder(_) => None,
    };
    let gone = is_gone(&pinned, listed.clone(), |p| std::path::Path::new(p).is_dir());
    Ok(Info { name: listed.flatten().unwrap_or_default(), gone })
}

#[tauri::command(async)]
pub fn pin_widget_icon(id: String) -> Result<Option<String>, String> {
    icon_of_exe(target_of(&parse(&id).ok_or("not a widget of that kind")?))
}

#[tauri::command(async)]
pub fn pin_widget_open(id: String) -> Result<(), String> {
    crate::preview::guard()?;
    let pinned = parse(&id).ok_or("not a widget of that kind")?;
    if !in_layout(crate::store::load("layout").as_ref(), &id) {
        return Err("not on the dock".into());
    }
    if let Pinned::Folder(path) = &pinned {
        if !std::path::Path::new(path).is_dir() {
            return Err("folder is gone".into());
        }
    }
    unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from(target_of(&pinned)), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
    }
    Ok(())
}

/// Windows' own window for choosing a folder, over the picker. None if it's cancelled.
#[tauri::command(async)]
pub fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    crate::preview::guard()?;
    let owner = app.get_webview_window("picker").and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize);
    on_com_thread(move || unsafe {
        let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).ok()?;
        dialog.SetOptions(dialog.GetOptions().ok()? | FOS_PICKFOLDERS).ok()?;
        dialog.Show(owner.map(|h| HWND(h as *mut _))).ok()?;
        let name = dialog.GetResult().ok()?.GetDisplayName(SIGDN_FILESYSPATH).ok()?;
        let path = name.to_string().ok();
        windows::Win32::System::Com::CoTaskMemFree(Some(name.0 as *const _));
        path
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn an_id_says_what_it_opens() {
        assert_eq!(parse("pin:app:{GUID}/Tool/tool.exe"), Some(Pinned::App(r"{GUID}\Tool\tool.exe".into())));
        assert_eq!(parse("pin:folder:C:/Users/me"), Some(Pinned::Folder(r"C:\Users\me".into())));
        assert_eq!(parse("pin:app:"), None);
        assert_eq!(parse("pin:exe:calc"), None);
        assert_eq!(parse("clock-and-weather"), None);
    }

    #[test]
    fn an_app_is_opened_through_the_apps_folder_and_nothing_else() {
        assert_eq!(target_of(&Pinned::App("paint".into())), r"shell:AppsFolder\paint");
    }

    #[test]
    fn only_a_widget_on_the_dock_can_open() {
        let saved = json!({ "ids": ["pin:app:paint"] });
        assert!(in_layout(Some(&saved), "pin:app:paint"));
        assert!(!in_layout(Some(&saved), "pin:app:calc"));
        assert!(!in_layout(None, "pin:app:paint"));
    }

    #[test]
    fn an_app_is_gone_only_if_the_known_list_lacks_it() {
        let app = Pinned::App("paint".into());
        assert!(!is_gone(&app, None, |_| true), "the list isn't ready yet");
        assert!(!is_gone(&app, Some(Some("Paint".into())), |_| true));
        assert!(is_gone(&app, Some(None), |_| true));
    }

    #[test]
    fn a_folder_is_gone_once_it_doesnt_exist() {
        let folder = Pinned::Folder(r"C:\x".into());
        assert!(is_gone(&folder, None, |_| false));
        assert!(!is_gone(&folder, None, |_| true));
    }
}
