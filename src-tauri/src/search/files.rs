//! File names in the user's folders, through Windows' own search index.

use std::ffi::c_void;
use std::time::{Duration, Instant};

use windows::core::{w, GUID, HSTRING, PCWSTR};
use windows::Win32::Foundation::PROPERTYKEY;
use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_INPROC_SERVER};
use windows::Win32::System::Search::Common::COP_VALUE_CONTAINS;
use windows::Win32::System::Search::{ConditionFactory, ICondition, IConditionFactory2, CONDITION_CREATION_DEFAULT};
use windows::Win32::UI::Shell::{
    BHID_EnumItems, FOLDERID_Profile, IEnumShellItems, ISearchFolderItemFactory, IShellItem, IShellItemArray, SHCreateShellItemArrayFromShellItem,
    SHGetKnownFolderItem, SearchFolderItemFactory, KF_FLAG_DEFAULT, SIGDN_FILESYSPATH,
};

const ITEM_NAME: PROPERTYKEY = PROPERTYKEY { fmtid: GUID::from_u128(0xb725f130_47ef_101a_a5f1_02608c9eebac), pid: 10 };
const MOST: usize = 12;
const GIVE_UP_AFTER: Duration = Duration::from_secs(4);

const MOST_RECENT: usize = 6;
const SHORTCUT: &str = ".lnk";

/// Windows' Recent folder holds a shortcut for each file and folder opened. A file's shortcut keeps
/// its extension in its name, as in report.pdf.lnk, and a folder's doesn't.
fn recent_shortcuts(mut found: Vec<(String, u64)>) -> Vec<String> {
    found.retain(|(name, _)| name.strip_suffix(SHORTCUT).is_some_and(|stem| stem.contains('.')));
    found.sort_by_key(|(_, modified)| std::cmp::Reverse(*modified));
    found.into_iter().take(MOST_RECENT).map(|(name, _)| name).collect()
}

pub fn recent_name(shortcut: &str) -> &str {
    shortcut.strip_suffix(SHORTCUT).unwrap_or(shortcut)
}

/// Paths of the shortcuts for recently opened files, as Windows itself keeps them.
pub fn recent() -> Vec<String> {
    let Some(folder) = std::env::var_os("APPDATA").map(|d| std::path::PathBuf::from(d).join(r"Microsoft\Windows\Recent")) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&folder) else { return Vec::new() };
    let found = entries
        .flatten()
        .filter_map(|e| {
            let modified = e.metadata().ok()?.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs();
            Some((e.file_name().to_string_lossy().into_owned(), modified))
        })
        .collect();
    recent_shortcuts(found).into_iter().map(|name| folder.join(name).to_string_lossy().into_owned()).collect()
}

pub fn file_name(path: &str) -> &str {
    path.rsplit('\\').next().unwrap_or(path)
}

pub fn folder_of(path: &str) -> &str {
    path.rsplit_once('\\').map_or("", |(parent, _)| parent.rsplit('\\').next().unwrap_or(parent))
}

/// Paths of matching files, stopping early once `still_wanted` says a newer search has begun.
pub fn find(query: &str, still_wanted: impl Fn() -> bool) -> Result<Vec<String>, String> {
    let failed = |e: windows::core::Error| e.to_string();
    unsafe {
        let conditions: IConditionFactory2 = CoCreateInstance(&ConditionFactory, None, CLSCTX_INPROC_SERVER).map_err(failed)?;
        let condition: ICondition = conditions.CreateStringLeaf(&ITEM_NAME, COP_VALUE_CONTAINS, &HSTRING::from(query), PCWSTR::null(), CONDITION_CREATION_DEFAULT).map_err(failed)?;
        let home: IShellItem = SHGetKnownFolderItem(&FOLDERID_Profile, KF_FLAG_DEFAULT, None).map_err(failed)?;
        let scope: IShellItemArray = SHCreateShellItemArrayFromShellItem(&home).map_err(failed)?;

        let search: ISearchFolderItemFactory = CoCreateInstance(&SearchFolderItemFactory, None, CLSCTX_INPROC_SERVER).map_err(failed)?;
        search.SetDisplayName(w!("Shelf")).map_err(failed)?;
        search.SetScope(&scope).map_err(failed)?;
        search.SetCondition(&condition).map_err(failed)?;
        let folder: IShellItem = search.GetShellItem().map_err(failed)?;
        let items: IEnumShellItems = folder.BindToHandler(None, &BHID_EnumItems).map_err(failed)?;

        let started = Instant::now();
        let mut paths = Vec::new();
        while paths.len() < MOST && still_wanted() && started.elapsed() < GIVE_UP_AFTER {
            let (mut one, mut fetched) = ([None], 0);
            if items.Next(&mut one, Some(&mut fetched)).is_err() || fetched == 0 {
                break;
            }
            let Some(item) = one[0].take() else { break };
            let Ok(raw) = item.GetDisplayName(SIGDN_FILESYSPATH) else { continue };
            let path = raw.to_string().unwrap_or_default();
            CoTaskMemFree(Some(raw.as_ptr() as *const c_void));
            if !path.is_empty() && !path.contains(r"\AppData\") {
                paths.push(path);
            }
        }
        Ok(paths)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_files_are_newest_first_and_at_most_six() {
        let found: Vec<_> = (0..9).map(|i| (format!("f{i}.pdf.lnk"), i as u64)).collect();
        let recent = recent_shortcuts(found);
        assert_eq!(recent.len(), 6);
        assert_eq!(recent[0], "f8.pdf.lnk");
    }

    #[test]
    fn recent_folders_and_other_things_are_left_out() {
        let found = vec![("Documents.lnk".to_string(), 3), ("report.pdf.lnk".to_string(), 2), ("desktop.ini".to_string(), 1)];
        assert_eq!(recent_shortcuts(found), ["report.pdf.lnk"]);
    }

    #[test]
    fn a_recent_file_is_named_without_its_shortcut() {
        assert_eq!(recent_name("report.final.pdf.lnk"), "report.final.pdf");
    }

    #[test]
    fn a_file_shows_its_folder() {
        assert_eq!(folder_of(r"C:\Users\me\Documents\report.pdf"), "Documents");
        assert_eq!(folder_of(r"C:\report.pdf"), "C:");
        assert_eq!(folder_of("report.pdf"), "");
    }
}
