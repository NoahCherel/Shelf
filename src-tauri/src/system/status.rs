//! What the taskbar's corner shows: network and sound, and the way into Windows' own panels.

use serde::Serialize;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::NetworkManagement::WiFi::{
    wlan_interface_state_connected, wlan_intf_opcode_current_connection, WlanCloseHandle, WlanEnumInterfaces,
    WlanFreeMemory, WlanOpenHandle, WlanQueryInterface, WLAN_CONNECTION_ATTRIBUTES, WLAN_INTERFACE_INFO,
    WLAN_INTERFACE_INFO_LIST,
};
use windows::Win32::Networking::NetworkListManager::{INetworkListManager, NetworkListManager};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::Win32::UI::Input::KeyboardAndMouse::{VK_A, VK_CONTROL, VK_LWIN, VK_N, VK_S, VK_V};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use super::{battery, tap_keys, Battery};

#[derive(Serialize)]
pub struct Wifi {
    ssid: String,
    signal: u32,
}

#[derive(Serialize)]
pub struct Volume {
    percent: u32,
    muted: bool,
}

#[derive(Serialize)]
pub struct Status {
    wifi: Option<Wifi>,
    online: bool,
    volume: Option<Volume>,
    battery: Option<Battery>,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Panel {
    Quick,
    Notifications,
    Search,
    Sound,
    Wifi,
}

/// Only these, whatever the page asks.
pub fn panel_for(kind: &str) -> Option<Panel> {
    match kind {
        "quick" => Some(Panel::Quick),
        "notifications" => Some(Panel::Notifications),
        "search" => Some(Panel::Search),
        "sound" => Some(Panel::Sound),
        "wifi" => Some(Panel::Wifi),
        _ => None,
    }
}

fn ssid_text(raw: &[u8], length: u32) -> String {
    String::from_utf8_lossy(&raw[..(length as usize).min(raw.len())]).into_owned()
}

fn percent(scalar: f32) -> u32 {
    (scalar.clamp(0.0, 1.0) * 100.0).round() as u32
}

/// The connected Wi-Fi network, if any. A PC without Wi-Fi just has none.
unsafe fn current_wifi() -> Option<Wifi> {
    let mut version = 0;
    let mut client = HANDLE::default();
    if WlanOpenHandle(2, None, &mut version, &mut client) != 0 {
        return None;
    }
    let mut found = None;
    let mut list: *mut WLAN_INTERFACE_INFO_LIST = std::ptr::null_mut();
    if WlanEnumInterfaces(client, None, &mut list) == 0 && !list.is_null() {
        let count = (*list).dwNumberOfItems as usize;
        let first = std::ptr::addr_of!((*list).InterfaceInfo) as *const WLAN_INTERFACE_INFO;
        for info in std::slice::from_raw_parts(first, count) {
            if info.isState != wlan_interface_state_connected {
                continue;
            }
            let mut size = 0;
            let mut data = std::ptr::null_mut();
            let asked = WlanQueryInterface(
                client,
                &info.InterfaceGuid,
                wlan_intf_opcode_current_connection,
                None,
                &mut size,
                &mut data,
                None,
            );
            if asked == 0 && !data.is_null() {
                let association = &(*(data as *const WLAN_CONNECTION_ATTRIBUTES)).wlanAssociationAttributes;
                found = Some(Wifi {
                    ssid: ssid_text(&association.dot11Ssid.ucSSID, association.dot11Ssid.uSSIDLength),
                    signal: association.wlanSignalQuality,
                });
                WlanFreeMemory(data);
                break;
            }
        }
        WlanFreeMemory(list as *const _);
    }
    WlanCloseHandle(client, None);
    found
}

unsafe fn is_online() -> bool {
    let manager: windows::core::Result<INetworkListManager> = CoCreateInstance(&NetworkListManager, None, CLSCTX_ALL);
    manager.and_then(|m| m.IsConnectedToInternet()).is_ok_and(|on| on.as_bool())
}

unsafe fn current_volume() -> Option<Volume> {
    let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
    let speaker = devices.GetDefaultAudioEndpoint(eRender, eMultimedia).ok()?;
    let volume: IAudioEndpointVolume = speaker.Activate(CLSCTX_ALL, None).ok()?;
    Some(Volume {
        percent: percent(volume.GetMasterVolumeLevelScalar().ok()?),
        muted: volume.GetMute().ok()?.as_bool(),
    })
}

#[tauri::command(async)]
pub fn system_status() -> Status {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        Status { wifi: current_wifi(), online: is_online(), volume: current_volume(), battery: battery() }
    }
}

/// Windows' own panels, opened the way its keyboard shortcuts do. They work with the taskbar hidden.
#[tauri::command]
pub fn shell_panel(kind: String) -> Result<(), String> {
    crate::preview::guard()?;
    match panel_for(&kind).ok_or("unknown panel")? {
        Panel::Quick => tap_keys(&[VK_LWIN, VK_A]),
        Panel::Notifications => tap_keys(&[VK_LWIN, VK_N]),
        Panel::Search => tap_keys(&[VK_LWIN, VK_S]),
        Panel::Sound => tap_keys(&[VK_LWIN, VK_CONTROL, VK_V]),
        Panel::Wifi => unsafe {
            ShellExecuteW(None, w!("open"), w!("ms-availablenetworks:"), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
        },
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_names_are_read_to_their_length() {
        let mut raw = [0u8; 32];
        raw[..7].copy_from_slice(b"Livebox");
        assert_eq!(ssid_text(&raw, 7), "Livebox");
    }

    #[test]
    fn a_bad_length_or_odd_bytes_cant_break_it() {
        assert_eq!(ssid_text(&[b'a'; 32], 99).len(), 32);
        assert_eq!(ssid_text(&[0xFF, b'a'], 2), "\u{FFFD}a");
    }

    #[test]
    fn volume_becomes_a_whole_percent() {
        assert_eq!(percent(0.404), 40);
        assert_eq!(percent(1.0), 100);
        assert_eq!(percent(-0.1), 0);
    }

    #[test]
    fn each_panel_has_its_shortcut() {
        use Panel::*;
        assert_eq!(panel_for("quick"), Some(Quick));
        assert_eq!(panel_for("notifications"), Some(Notifications));
        assert_eq!(panel_for("search"), Some(Search));
        assert_eq!(panel_for("sound"), Some(Sound));
        assert_eq!(panel_for("wifi"), Some(Wifi));
        assert_eq!(panel_for("calc.exe"), None, "only these, whatever the page asks");
    }
}
