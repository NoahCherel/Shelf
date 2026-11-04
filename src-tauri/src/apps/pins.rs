//! The apps pinned to the Windows taskbar, read from their shortcuts.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use windows::core::{Interface, HSTRING};
use windows::Win32::System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

use super::merge::{keep_pin, Pin};
use super::windows::{store_string, APP_ID_KEY};

/// Only re-read when the folder changes.
static CACHE: Mutex<Option<(SystemTime, Vec<Pin>)>> = Mutex::new(None);

fn folder() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_default();
    Path::new(&base).join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar")
}

fn read_link(path: &Path) -> Option<Pin> {
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let file: IPersistFile = link.cast().ok()?;
        file.Load(&HSTRING::from(path.as_os_str()), STGM_READ).ok()?;

        let mut buf = [0u16; 1024];
        let target = link
            .GetPath(&mut buf, std::ptr::null_mut(), 0)
            .ok()
            .map(|_| String::from_utf16_lossy(&buf[..buf.iter().position(|&c| c == 0).unwrap_or(0)]))
            .filter(|t| !t.is_empty());
        let app_id = link.cast::<IPropertyStore>().ok().and_then(|s| store_string(&s, &APP_ID_KEY));
        Some(Pin {
            name: path.file_stem()?.to_string_lossy().into_owned(),
            link: path.to_string_lossy().into_owned(),
            target,
            app_id,
        })
    }
}

fn read_all(dir: &Path) -> Vec<Pin> {
    let Ok(files) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut paths: Vec<PathBuf> = files.flatten().map(|f| f.path()).collect();
    paths.retain(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("lnk")));
    paths.sort();
    paths
        .iter()
        .filter_map(|p| read_link(p))
        .filter(|pin| keep_pin(pin, |t| Path::new(t).exists()))
        .collect()
}

/// Call on a thread with COM initialised.
pub fn list() -> Vec<Pin> {
    let dir = folder();
    let stamp = std::fs::metadata(&dir).and_then(|m| m.modified()).unwrap_or(SystemTime::UNIX_EPOCH);
    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    match &*cache {
        Some((when, pins)) if *when == stamp => pins.clone(),
        _ => {
            let pins = read_all(&dir);
            *cache = Some((stamp, pins.clone()));
            pins
        }
    }
}
