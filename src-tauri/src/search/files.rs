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
    fn a_file_shows_its_folder() {
        assert_eq!(folder_of(r"C:\Users\me\Documents\report.pdf"), "Documents");
        assert_eq!(folder_of(r"C:\report.pdf"), "C:");
        assert_eq!(folder_of("report.pdf"), "");
    }
}
