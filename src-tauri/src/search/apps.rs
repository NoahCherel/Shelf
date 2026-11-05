//! Everything Windows lists as an app, from the same folder as the Start menu's "All".

use std::ffi::c_void;

use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::UI::Shell::{
    BHID_EnumItems, FOLDERID_AppsFolder, IEnumShellItems, IShellItem, SHGetKnownFolderItem, KF_FLAG_DEFAULT, SIGDN, SIGDN_DESKTOPABSOLUTEPARSING,
    SIGDN_NORMALDISPLAY,
};

const NOT_APPS: [&str; 8] = [".txt", ".url", ".html", ".htm", ".pdf", ".chm", ".rtf", ".md"];

/// The folder also holds uninstallers, help files and web links.
fn is_app(name: &str, parsing: &str) -> bool {
    let (name, parsing) = (name.to_lowercase(), parsing.to_lowercase());
    !name.is_empty()
        && !name.contains("uninstall")
        && !name.contains("désinstall")
        && !parsing.starts_with("http")
        && !NOT_APPS.iter().any(|end| parsing.ends_with(end))
}

unsafe fn text_of(item: &IShellItem, kind: SIGDN) -> Option<String> {
    let raw = item.GetDisplayName(kind).ok()?;
    let text = raw.to_string().ok();
    CoTaskMemFree(Some(raw.as_ptr() as *const c_void));
    text
}

/// (name, parsing name) for each app.
pub fn list() -> Result<Vec<(String, String)>, String> {
    unsafe {
        let folder: IShellItem = SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None).map_err(|e| e.to_string())?;
        let items: IEnumShellItems = folder.BindToHandler(None, &BHID_EnumItems).map_err(|e| e.to_string())?;
        let mut apps = Vec::new();
        loop {
            let (mut one, mut fetched) = ([None], 0);
            if items.Next(&mut one, Some(&mut fetched)).is_err() || fetched == 0 {
                break;
            }
            let Some(item) = one[0].take() else { break };
            if let (Some(name), Some(parsing)) = (text_of(&item, SIGDN_NORMALDISPLAY), text_of(&item, SIGDN_DESKTOPABSOLUTEPARSING)) {
                if is_app(&name, &parsing) {
                    apps.push((name, parsing));
                }
            }
        }
        Ok(apps)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apps_stay_and_what_isnt_an_app_goes() {
        assert!(is_app("Paint", "Microsoft.Paint_8wekyb3d8bbwe!App"));
        assert!(is_app("Firefox", "308046B0AF4A39CB"));
        assert!(!is_app("Uninstall Foo", "{GUID}\\Foo\\uninstall.exe"));
        assert!(!is_app("Désinstaller Foo", "{GUID}\\Foo\\unins000.exe"));
        assert!(!is_app("Foo Help", "{GUID}\\Foo\\help.chm"));
        assert!(!is_app("Foo Site", "https://foo.example"));
        assert!(!is_app("Readme", "C:\\Foo\\readme.txt"));
        assert!(!is_app("", "Something"));
    }
}
