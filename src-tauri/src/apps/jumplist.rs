//! What a Windows taskbar button's menu lists above its own items: an app's tasks, its recent
//! files, and File Explorer's quick access. Read from what Windows keeps for each app, never run
//! from anything the page sends but a fingerprint of the line chosen.

use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// One line of a jump list: what it says, and what opening it runs.
#[derive(Clone, Debug, PartialEq)]
pub struct Link {
    pub title: String,
    pub path: String,
    pub args: String,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Kind {
    Tasks,
    Recent,
    QuickAccess,
}

const MOST_RECENT: usize = 8;
const MOST_QUICK_ACCESS: usize = 10;
/// The CLSID of a shell link, as stored before each one in a custom jump list file.
const SHELL_LINK_CLSID: [u8; 16] = [0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46];

/// Stable across reads, so the line chosen is found again however the list was reordered.
pub fn fingerprint(link: &Link) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in link.path.bytes().chain([0]).chain(link.args.bytes()) {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}")
}

/// Only a line that's still in the list runs, so a stale menu can't open something else.
pub fn find<'a>(links: &'a [Link], print: &str) -> Option<&'a Link> {
    links.iter().find(|l| fingerprint(l) == print)
}

/// Windows' own words for each section, so the menu reads as it does on the taskbar.
pub fn section_title(kind: Kind, lang: u16) -> &'static str {
    let french = lang & 0x3FF == 0x0C;
    match (kind, french) {
        (Kind::Tasks, true) => "Tâches",
        (Kind::Tasks, false) => "Tasks",
        (Kind::Recent, true) => "Récent",
        (Kind::Recent, false) => "Recent",
        (Kind::QuickAccess, true) => "Accès rapide",
        (Kind::QuickAccess, false) => "Quick access",
    }
}

/// Whether a custom jump list file mentions this program, as its links store paths in UTF-16.
pub fn mentions(bytes: &[u8], exe: &str) -> bool {
    let wanted: Vec<u16> = exe.to_lowercase().encode_utf16().collect();
    if wanted.is_empty() {
        return false;
    }
    let text: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).map(|u| char::from_u32(u as u32).map_or(u, |c| c.to_lowercase().next().unwrap_or(c) as u16)).collect();
    // Links can sit at an odd offset, so the other alignment is searched too.
    let odd: Vec<u16> = bytes.get(1..).unwrap_or(&[]).chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).map(|u| char::from_u32(u as u32).map_or(u, |c| c.to_lowercase().next().unwrap_or(c) as u16)).collect();
    [text, odd].iter().any(|t| t.windows(wanted.len()).any(|w| w == wanted.as_slice()))
}

/// Ends each category of a custom jump list file.
pub const FOOTER: u32 = 0xBABF_FBAB;

/// A category of a program's own jump list: one it named, such as Firefox's "Most visited", or its tasks.
#[derive(Clone, Debug, PartialEq)]
pub enum Category {
    Named(String),
    Tasks,
}

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
}

/// A custom jump list file, category by category, as documented for the format: a header, then each
/// category's kind, its name if it has one, its links each after the shell link CLSID, and a footer.
/// `read` loads one link from the start of what it's given and says how many bytes it took, with no
/// link for a separator. Whatever doesn't follow the format ends the reading, keeping what was read.
pub fn categories(bytes: &[u8], read: impl Fn(&[u8]) -> Option<(Option<Link>, usize)>) -> Vec<(Category, Vec<Link>)> {
    let mut out = Vec::new();
    let Some(count) = u32_at(bytes, 4) else { return out };
    let mut at = 12;
    for _ in 0..count {
        let Some(kind) = u32_at(bytes, at) else { break };
        at += 4;
        let (category, entries) = match kind {
            0 => {
                let Some(len) = bytes.get(at..at + 2).map(|b| u16::from_le_bytes([b[0], b[1]]) as usize) else { break };
                at += 2;
                let Some(raw) = bytes.get(at..at + len * 2) else { break };
                let name = String::from_utf16_lossy(&raw.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect::<Vec<_>>());
                at += len * 2;
                let Some(n) = u32_at(bytes, at) else { break };
                at += 4;
                (Some(Category::Named(name)), n)
            }
            // Frequent or recent, filled by Windows from elsewhere: only the category's id is here.
            1 => {
                at += 4;
                (None, 0)
            }
            2 => {
                let Some(n) = u32_at(bytes, at) else { break };
                at += 4;
                (Some(Category::Tasks), n)
            }
            _ => break,
        };
        let mut links = Vec::new();
        let mut whole = true;
        for _ in 0..entries {
            if bytes.get(at..at + SHELL_LINK_CLSID.len()) != Some(&SHELL_LINK_CLSID[..]) {
                whole = false;
                break;
            }
            at += SHELL_LINK_CLSID.len();
            let Some((link, used)) = read(&bytes[at..]) else {
                whole = false;
                break;
            };
            links.extend(link);
            at += used;
        }
        if let Some(category) = category {
            if !links.is_empty() {
                out.push((category, links));
            }
        }
        if !whole || u32_at(bytes, at) != Some(FOOTER) {
            break;
        }
        at += 4;
    }
    out
}

/// Where each shell link starts in a custom jump list file: just after its CLSID.
pub fn link_starts(bytes: &[u8]) -> Vec<usize> {
    bytes.windows(SHELL_LINK_CLSID.len()).enumerate().filter(|(_, w)| *w == SHELL_LINK_CLSID).map(|(i, _)| i + SHELL_LINK_CLSID.len()).collect()
}

/// Windows keeps one file per app id, and often old ones for the same program: the newest wins.
pub fn newest<T>(candidates: impl IntoIterator<Item = (T, SystemTime)>) -> Option<T> {
    candidates.into_iter().max_by_key(|(_, when)| *when).map(|(it, _)| it)
}

fn custom_folder() -> PathBuf {
    Path::new(&std::env::var("APPDATA").unwrap_or_default()).join(r"Microsoft\Windows\Recent\CustomDestinations")
}

/// The program's own lists, such as Firefox's "Most visited" and its tasks. Call on a COM thread.
pub fn lists(exe: &str) -> Vec<(Category, Vec<Link>)> {
    let Ok(files) = std::fs::read_dir(custom_folder()) else { return Vec::new() };
    let candidates = files.flatten().filter_map(|f| {
        let path = f.path();
        let when = f.metadata().and_then(|m| m.modified()).ok()?;
        let bytes = std::fs::read(&path).ok()?;
        mentions(&bytes, exe).then_some((bytes, when))
    });
    let Some(bytes) = newest(candidates) else { return Vec::new() };
    categories(&bytes, native::read_link)
        .into_iter()
        .map(|(category, links)| match category {
            Category::Named(name) => (Category::Named(native::resolved(name)), links),
            tasks => (tasks, links),
        })
        .collect()
}

/// The app's recent files, for an app that gave Windows an id of its own. Call on a COM thread.
pub fn recent(app_id: &str) -> Vec<Link> {
    native::recent(app_id, MOST_RECENT)
}

/// File Explorer's pinned and frequent folders. Call on a COM thread.
pub fn quick_access() -> Vec<Link> {
    native::quick_access(MOST_QUICK_ACCESS)
}

/// Opens a line of the list. Tasks run with their arguments; files and folders open as on a double-click.
pub fn open(link: &Link) {
    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let args = HSTRING::from(link.args.as_str());
    unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from(link.path.as_str()), if link.args.is_empty() { PCWSTR::null() } else { PCWSTR(args.as_ptr()) }, PCWSTR::null(), SW_SHOWNORMAL);
    }
}

mod native {
    use std::ffi::c_void;

    use windows::core::{Interface, GUID, HSTRING, PWSTR};
    use windows::Win32::Foundation::PROPERTYKEY;
    use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, IPersistStream, CLSCTX_INPROC_SERVER, STREAM_SEEK_CUR};
    use windows::Win32::UI::Shell::Common::IObjectArray;
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::{
        ApplicationDocumentLists, IApplicationDocumentLists, IEnumShellItems, IShellItem, IShellLinkW, SHCreateItemFromParsingName, SHCreateMemStream,
        SHLoadIndirectString, ShellLink, ADLT_RECENT, BHID_EnumItems, SIGDN, SIGDN_DESKTOPABSOLUTEPARSING, SIGDN_NORMALDISPLAY,
    };

    use super::Link;
    use crate::apps::store_string;

    const TITLE: PROPERTYKEY = PROPERTYKEY { fmtid: GUID::from_u128(0xf29f85e0_4ff9_1068_ab91_08002b27b3d9), pid: 2 };
    const QUICK_ACCESS: &str = "shell:::{679f85cb-0220-4080-b29b-5540cc05aab6}";

    fn until_nul(buf: &[u16]) -> String {
        String::from_utf16_lossy(&buf[..buf.iter().position(|&c| c == 0).unwrap_or(buf.len())])
    }

    /// "@C:\x.dll,-123" names a string in a program's resources.
    pub fn resolved(text: String) -> String {
        if !text.starts_with('@') {
            return text;
        }
        let mut out = [0u16; 260];
        match unsafe { SHLoadIndirectString(&HSTRING::from(text.as_str()), &mut out, None) } {
            Ok(()) => until_nul(&out),
            Err(_) => String::new(),
        }
    }

    /// One shell link stored at the start of `bytes`, and how many bytes it took. A separator has
    /// no link.
    pub fn read_link(bytes: &[u8]) -> Option<(Option<Link>, usize)> {
        unsafe {
            let stream = SHCreateMemStream(Some(bytes))?;
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
            link.cast::<IPersistStream>().ok()?.Load(&stream).ok()?;
            let mut used = 0u64;
            stream.Seek(0, STREAM_SEEK_CUR, Some(&mut used)).ok()?;
            Some((described(&link), used as usize))
        }
    }

    unsafe fn described(link: &IShellLinkW) -> Option<Link> {
        unsafe {
            let mut path = [0u16; 1024];
            link.GetPath(&mut path, std::ptr::null_mut(), 0).ok()?;
            let path = until_nul(&path);
            if path.is_empty() {
                return None;
            }
            let mut args = [0u16; 2048];
            let _ = link.GetArguments(&mut args);
            let title = link.cast::<IPropertyStore>().ok().and_then(|s| store_string(&s, &TITLE)).map(resolved).filter(|t| !t.is_empty());
            let title = title.or_else(|| {
                let mut description = [0u16; 512];
                link.GetDescription(&mut description).ok()?;
                Some(resolved(until_nul(&description))).filter(|t| !t.is_empty())
            })?;
            Some(Link { title, path, args: until_nul(&args) })
        }
    }

    unsafe fn text_of(item: &IShellItem, kind: SIGDN) -> Option<String> {
        let raw: PWSTR = item.GetDisplayName(kind).ok()?;
        let text = raw.to_string().ok();
        CoTaskMemFree(Some(raw.as_ptr() as *const c_void));
        text
    }

    unsafe fn as_link(item: &IShellItem) -> Option<Link> {
        Some(Link { title: text_of(item, SIGDN_NORMALDISPLAY)?, path: text_of(item, SIGDN_DESKTOPABSOLUTEPARSING)?, args: String::new() })
    }

    pub fn recent(app_id: &str, most: usize) -> Vec<Link> {
        unsafe {
            let Ok(lists) = CoCreateInstance::<_, IApplicationDocumentLists>(&ApplicationDocumentLists, None, CLSCTX_INPROC_SERVER) else { return Vec::new() };
            if lists.SetAppID(&HSTRING::from(app_id)).is_err() {
                return Vec::new();
            }
            let Ok(array) = lists.GetList::<IObjectArray>(ADLT_RECENT, most as u32) else { return Vec::new() };
            let count = array.GetCount().unwrap_or(0);
            (0..count).filter_map(|i| array.GetAt::<IShellItem>(i).ok()).filter_map(|item| as_link(&item)).take(most).collect()
        }
    }

    pub fn quick_access(most: usize) -> Vec<Link> {
        unsafe {
            let Ok(folder) = SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(QUICK_ACCESS), None) else { return Vec::new() };
            let Ok(items) = folder.BindToHandler::<_, IEnumShellItems>(None, &BHID_EnumItems) else { return Vec::new() };
            let mut out = Vec::new();
            while out.len() < most {
                let (mut one, mut fetched) = ([None], 0);
                if items.Next(&mut one, Some(&mut fetched)).is_err() || fetched == 0 {
                    break;
                }
                if let Some(link) = one[0].take().and_then(|item| as_link(&item)) {
                    out.push(link);
                }
            }
            out
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn link(path: &str, args: &str) -> Link {
        Link { title: "x".into(), path: path.into(), args: args.into() }
    }

    fn utf16(text: &str) -> Vec<u8> {
        text.encode_utf16().flat_map(|u| u.to_le_bytes()).collect()
    }

    #[test]
    fn a_line_is_known_by_what_it_runs_and_found_again() {
        let new_tab = link(r"C:\Firefox\firefox.exe", "-new-tab");
        let private = link(r"C:\Firefox\firefox.exe", "-private-window");
        assert_ne!(fingerprint(&new_tab), fingerprint(&private));
        assert_eq!(fingerprint(&new_tab), fingerprint(&new_tab.clone()));
        let list = vec![new_tab.clone(), private.clone()];
        assert_eq!(find(&list, &fingerprint(&private)), Some(&private));
    }

    #[test]
    fn a_line_no_longer_in_the_list_runs_nothing() {
        let list = vec![link("a.exe", "")];
        assert_eq!(find(&list, "0123456789abcdef"), None);
        assert_eq!(find(&list, "calc.exe"), None);
    }

    #[test]
    fn sections_are_named_in_windows_language() {
        assert_eq!(section_title(Kind::Tasks, 0x040C), "Tâches");
        assert_eq!(section_title(Kind::Recent, 0x040C), "Récent");
        assert_eq!(section_title(Kind::QuickAccess, 0x0409), "Quick access");
    }

    #[test]
    fn a_file_is_matched_to_its_program_whatever_the_case_or_alignment() {
        let mut bytes = vec![0u8; 7];
        bytes.extend(utf16(r"C:\Program Files\Mozilla Firefox\FIREFOX.exe"));
        assert!(mentions(&bytes, r"c:\program files\mozilla firefox\firefox.exe"));
        let mut odd = vec![0u8; 8];
        odd.extend(utf16(r"C:\Program Files\Mozilla Firefox\firefox.exe"));
        assert!(mentions(&odd, r"C:\Program Files\Mozilla Firefox\firefox.exe"));
        assert!(!mentions(&bytes, r"C:\Edge\msedge.exe"));
        assert!(!mentions(&bytes, ""));
    }

    #[test]
    fn each_shell_link_is_found_just_after_its_clsid() {
        let mut bytes = vec![9, 9];
        bytes.extend(SHELL_LINK_CLSID);
        bytes.extend([1, 2, 3]);
        bytes.extend(SHELL_LINK_CLSID);
        assert_eq!(link_starts(&bytes), vec![18, 37]);
        assert!(link_starts(&[0; 40]).is_empty());
    }

    /// A fake link reader: each "link" is one byte naming its title, and takes 4 bytes.
    fn fake_reader(bytes: &[u8]) -> Option<(Option<Link>, usize)> {
        let title = *bytes.first()? as char;
        Some(((title != '-').then(|| Link { title: title.to_string(), path: "p".into(), args: title.to_string() }), 4))
    }

    fn u32le(n: u32) -> Vec<u8> {
        n.to_le_bytes().to_vec()
    }

    fn entry(title: u8) -> Vec<u8> {
        let mut out = SHELL_LINK_CLSID.to_vec();
        out.extend([title, 0, 0, 0]);
        out
    }

    #[test]
    fn a_custom_list_is_read_category_by_category_as_windows_keeps_it() {
        let mut file = [u32le(2), u32le(3), u32le(0)].concat();
        // A named category, as Firefox's "most visited".
        file.extend(u32le(0));
        let name = utf16("Les plus visités");
        file.extend(((name.len() / 2) as u16).to_le_bytes());
        file.extend(name);
        file.extend(u32le(2));
        file.extend(entry(b'a'));
        file.extend(entry(b'b'));
        file.extend(u32le(FOOTER));
        // A known category, filled by Windows elsewhere: nothing in this file.
        file.extend(u32le(1));
        file.extend(u32le(2));
        file.extend(u32le(FOOTER));
        // The tasks, with a separator line.
        file.extend(u32le(2));
        file.extend(u32le(2));
        file.extend(entry(b't'));
        file.extend(entry(b'-'));
        file.extend(u32le(FOOTER));
        let lists = categories(&file, fake_reader);
        assert_eq!(lists.len(), 2);
        assert_eq!(lists[0].0, Category::Named("Les plus visités".into()));
        assert_eq!(lists[0].1.iter().map(|l| l.title.as_str()).collect::<Vec<_>>(), ["a", "b"]);
        assert_eq!(lists[1].0, Category::Tasks);
        assert_eq!(lists[1].1.iter().map(|l| l.title.as_str()).collect::<Vec<_>>(), ["t"], "the separator isn't a line");
    }

    #[test]
    fn a_file_that_doesnt_follow_the_format_gives_what_was_read_and_stops() {
        let mut file = [u32le(2), u32le(1), u32le(0)].concat();
        file.extend(u32le(2));
        file.extend(u32le(5));
        file.extend(entry(b't'));
        // Cut short: four links promised, none there.
        let lists = categories(&file, fake_reader);
        assert_eq!(lists, vec![(Category::Tasks, vec![Link { title: "t".into(), path: "p".into(), args: "t".into() }])]);
        assert!(categories(&[1, 2, 3], fake_reader).is_empty());
    }

    #[test]
    fn of_several_files_for_a_program_the_newest_is_used() {
        let old = SystemTime::UNIX_EPOCH + Duration::from_secs(10);
        let new = SystemTime::UNIX_EPOCH + Duration::from_secs(99);
        assert_eq!(newest([("old", old), ("new", new)]), Some("new"));
        assert_eq!(newest(Vec::<(&str, SystemTime)>::new()), None);
    }
}
