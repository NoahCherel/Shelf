//! What the taskbar's corner shows: network, sound, battery and how many notifications wait.

use serde::Serialize;
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

use super::{battery, notifications, Battery};

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
    notifications: u32,
}

fn ssid_text(raw: &[u8], length: u32) -> String {
    String::from_utf8_lossy(&raw[..(length as usize).min(raw.len())]).into_owned()
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
        percent: crate::system::percent(volume.GetMasterVolumeLevelScalar().ok()?),
        muted: volume.GetMute().ok()?.as_bool(),
    })
}

#[tauri::command(async)]
pub fn system_status() -> Status {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        Status { wifi: current_wifi(), online: is_online(), volume: current_volume(), battery: battery(), notifications: notifications::count() }
    }
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
        assert_eq!(crate::system::percent(0.404), 40);
        assert_eq!(crate::system::percent(1.0), 100);
        assert_eq!(crate::system::percent(-0.1), 0);
    }
}
