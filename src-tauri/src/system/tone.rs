//! The alert sound picked in Settings (F-081), from the ones Windows has in %WINDIR%\Media.
//! Nothing is shipped with Shelf, and a missing file plays nothing.

use std::path::PathBuf;

use windows::core::HSTRING;
use windows::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_FILENAME, SND_NODEFAULT};

/// The file in %WINDIR%\Media for each choice in Settings. "none", and anything unknown, has none.
pub fn tone_file(name: &str) -> Option<&'static str> {
    Some(match name {
        "notify" => "Windows Notify System Generic.wav",
        "calendar" => "Windows Notify Calendar.wav",
        "chimes" => "chimes.wav",
        "ding" => "ding.wav",
        "tada" => "tada.wav",
        "alarm" => "Alarm01.wav",
        _ => return None,
    })
}

/// Plays it without waiting for it to end.
pub fn play(name: &str) {
    let Some(file) = tone_file(name) else { return };
    let windows = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into());
    let path = PathBuf::from(windows).join("Media").join(file);
    unsafe {
        let _ = PlaySoundW(&HSTRING::from(path.as_os_str()), None, SND_FILENAME | SND_ASYNC | SND_NODEFAULT);
    }
}

/// Settings plays a sound when it's picked.
#[tauri::command(async)]
pub fn play_tone(name: String) {
    play(&name);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_tone_but_none_has_a_windows_sound() {
        assert_eq!(tone_file("tada"), Some("tada.wav"));
        assert_eq!(tone_file("notify"), Some("Windows Notify System Generic.wav"));
        assert_eq!(tone_file("calendar"), Some("Windows Notify Calendar.wav"));
        assert_eq!(tone_file("chimes"), Some("chimes.wav"));
        assert_eq!(tone_file("ding"), Some("ding.wav"));
        assert_eq!(tone_file("alarm"), Some("Alarm01.wav"));
        assert_eq!(tone_file("none"), None);
        assert_eq!(tone_file("../x"), None);
    }
}
