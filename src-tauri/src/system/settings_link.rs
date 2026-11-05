//! Opens a page of Windows Settings, for what Shelf can't do itself.

use windows::core::{w, HSTRING, PCWSTR};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

const PAGES: [&str; 10] = ["sound", "network-wifi", "network-airplanemode", "bluetooth", "display", "batterysaver", "nightlight", "quiethours", "privacy-location", "privacy-notifications"];

/// Only these pages, whatever the page asks: this ends up in ShellExecute.
fn settings_uri(page: &str) -> Option<String> {
    PAGES.contains(&page).then(|| format!("ms-settings:{page}"))
}

#[tauri::command]
pub fn open_settings(page: String) -> Result<(), String> {
    crate::preview::guard()?;
    let uri = settings_uri(&page).ok_or("unknown settings page")?;
    unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from(uri), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_settings_pages_open() {
        for page in ["sound", "network-wifi", "network-airplanemode", "bluetooth", "display", "batterysaver", "nightlight", "quiethours", "privacy-location", "privacy-notifications"] {
            assert_eq!(settings_uri(page), Some(format!("ms-settings:{page}")));
        }
        assert_eq!(settings_uri("windowsupdate"), None);
    }

    #[test]
    fn a_page_cannot_smuggle_in_another_uri() {
        for page in ["sound&x", "sound?x=1", "calc.exe", "https://example.com", "", "ms-settings:sound"] {
            assert_eq!(settings_uri(page), None, "{page}");
        }
    }
}
