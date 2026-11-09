//! The Wi-Fi card's list and connections. The Windows calls sit behind `Wlan`, so tests never touch the adapter.

use std::ffi::c_void;
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use windows::core::{GUID, HSTRING, PCWSTR};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::NetworkManagement::WiFi::{
    dot11_BSS_type_any, dot11_BSS_type_infrastructure, dot11_radio_state_on, wlan_connection_mode_profile,
    wlan_interface_state_connected, wlan_intf_opcode_radio_state, wlan_notification_acm_connection_attempt_fail,
    wlan_notification_acm_connection_complete, WlanCloseHandle, WlanConnect, WlanDeleteProfile, WlanDisconnect,
    WlanEnumInterfaces, WlanFreeMemory, WlanGetAvailableNetworkList, WlanOpenHandle, WlanQueryInterface,
    WlanRegisterNotification, WlanScan, WlanSetProfile, L2_NOTIFICATION_DATA, WLAN_AVAILABLE_NETWORK,
    WLAN_AVAILABLE_NETWORK_CONNECTED, WLAN_AVAILABLE_NETWORK_HAS_PROFILE, WLAN_AVAILABLE_NETWORK_LIST,
    WLAN_CONNECTION_NOTIFICATION_DATA, WLAN_CONNECTION_PARAMETERS, WLAN_INTERFACE_INFO, WLAN_INTERFACE_INFO_LIST,
    WLAN_NOTIFICATION_SOURCE_ACM, WLAN_NOTIFICATION_SOURCE_NONE, WLAN_RADIO_STATE, WLAN_REASON_CODE_KEY_MISMATCH,
    WLAN_REASON_CODE_MSMSEC_PROFILE_PASSPHRASE_CHAR, WLAN_REASON_CODE_MSMSEC_PSK_MISMATCH_SUSPECTED,
};

const ACCESS_DENIED: u32 = 5;
const WAIT_FOR_RESULT: Duration = Duration::from_secs(20);
const TIMED_OUT: u32 = u32::MAX;
const KEY_MISMATCH: u32 = WLAN_REASON_CODE_KEY_MISMATCH;
/// Long enough to reopen the card and see how it went, short enough not to linger tomorrow.
const ATTEMPT_LIFE_MS: u64 = 120_000;

#[derive(Clone, Copy, PartialEq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Auth {
    Open,
    Wpa2,
    Wpa3,
    Enterprise,
    Other,
}

#[derive(Clone)]
pub struct RawNetwork {
    ssid: Vec<u8>,
    signal: u32,
    auth: Auth,
    profile: Option<String>,
    connected: bool,
}

#[derive(Serialize, Debug)]
pub struct Network {
    id: String,
    name: String,
    signal: u32,
    auth: Auth,
    saved: bool,
    connected: bool,
}

#[derive(Serialize, Clone)]
pub struct Attempt {
    id: String,
    state: &'static str,
    error: Option<String>,
}

#[derive(Serialize)]
pub struct WifiList {
    adapter: bool,
    on: bool,
    permission: bool,
    attempt: Option<Attempt>,
    networks: Vec<Network>,
}

pub trait Wlan {
    /// Err is Windows' error code.
    fn networks(&self) -> Result<Vec<RawNetwork>, u32>;
    fn set_profile(&self, xml: &str) -> Result<(), u32>;
    /// Waits for the outcome. Err is Windows' reason code, or TIMED_OUT.
    fn connect(&self, profile: &str, ssid: &[u8]) -> Result<(), u32>;
    fn delete_profile(&self, name: &str);
}

/// Windows' algorithm number. Everything not recognised is left to Settings.
fn auth_of(algorithm: i32) -> Auth {
    match algorithm {
        1 => Auth::Open,
        7 => Auth::Wpa2,
        9 => Auth::Wpa3,
        3 | 6 | 8 | 11 => Auth::Enterprise,
        _ => Auth::Other,
    }
}

/// The SSID's bytes in hex: names need not be valid text, and the id must survive to connect.
fn network_id(ssid: &[u8]) -> String {
    ssid.iter().map(|b| format!("{b:02X}")).collect()
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

fn profile_name(ssid: &[u8]) -> String {
    String::from_utf8_lossy(ssid).into_owned()
}

fn profile_xml(ssid: &[u8], auth: Auth, password: Option<&str>) -> String {
    let (authentication, encryption) = match auth {
        Auth::Wpa3 => ("WPA3SAE", "AES"),
        Auth::Wpa2 => ("WPA2PSK", "AES"),
        _ => ("open", "none"),
    };
    let key = password.map_or(String::new(), |p| {
        format!("<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>{}</keyMaterial></sharedKey>", escape(p))
    });
    format!(
        "<?xml version=\"1.0\"?><WLANProfile xmlns=\"http://www.microsoft.com/networking/WLAN/profile/v1\">\
<name>{}</name><SSIDConfig><SSID><hex>{}</hex></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode>\
<MSM><security><authEncryption><authentication>{authentication}</authentication><encryption>{encryption}</encryption><useOneX>false</useOneX></authEncryption>{key}</security></MSM></WLANProfile>",
        escape(&profile_name(ssid)),
        network_id(ssid),
    )
}

/// One row per name, connected first, then saved, then by signal. Hidden networks have no name to show.
fn merge_networks(raw: Vec<RawNetwork>) -> Vec<Network> {
    let mut merged: Vec<(Vec<u8>, Network)> = Vec::new();
    for network in raw.into_iter().filter(|n| !n.ssid.is_empty()) {
        let saved = network.profile.is_some();
        match merged.iter_mut().find(|(ssid, _)| *ssid == network.ssid) {
            Some((_, row)) => {
                row.signal = row.signal.max(network.signal);
                row.saved |= saved;
                row.connected |= network.connected;
            }
            None => merged.push((
                network.ssid.clone(),
                Network {
                    id: network_id(&network.ssid),
                    name: profile_name(&network.ssid),
                    signal: network.signal,
                    auth: network.auth,
                    saved,
                    connected: network.connected,
                },
            )),
        }
    }
    let mut rows: Vec<Network> = merged.into_iter().map(|(_, row)| row).collect();
    rows.sort_by_key(|n| (!n.connected, !n.saved, std::cmp::Reverse(n.signal)));
    rows
}

fn password_problem(password: &str) -> Option<&'static str> {
    (!(8..=63).contains(&password.chars().count())).then_some("Wi-Fi passwords are 8 to 63 characters.")
}

fn failure_text(reason: u32, saved: bool) -> &'static str {
    match reason {
        WLAN_REASON_CODE_KEY_MISMATCH | WLAN_REASON_CODE_MSMSEC_PSK_MISMATCH_SUSPECTED | WLAN_REASON_CODE_MSMSEC_PROFILE_PASSPHRASE_CHAR => {
            if saved {
                "The saved password didn't work. Change it in Settings."
            } else {
                "Wrong password."
            }
        }
        TIMED_OUT => "The connection timed out.",
        _ => "Windows couldn't connect to this network.",
    }
}

/// Takes the password by value: it goes into the profile and no further.
fn connect_network(wlan: &dyn Wlan, id: &str, password: Option<String>) -> Result<(), String> {
    let found = wlan.networks().map_err(|_| "Windows couldn't read the network list.".to_string())?;
    let mut matching = found.iter().filter(|n| network_id(&n.ssid) == id);
    let Some(first) = matching.next() else {
        return Err("That network is no longer in range.".into());
    };
    let network = if first.profile.is_some() { first } else { matching.find(|n| n.profile.is_some()).unwrap_or(first) };

    if let Some(profile) = &network.profile {
        return wlan.connect(profile, &network.ssid).map_err(|reason| failure_text(reason, true).to_string());
    }
    match network.auth {
        Auth::Enterprise | Auth::Other => return Err("This network has to be set up in Windows Settings.".into()),
        Auth::Open => {}
        Auth::Wpa2 | Auth::Wpa3 if password.is_none() => return Err("This network needs a password.".into()),
        Auth::Wpa2 | Auth::Wpa3 => {}
    }
    let xml = profile_xml(&network.ssid, network.auth, password.as_deref());
    drop(password);
    let set = wlan.set_profile(&xml);
    drop(xml);
    set.map_err(|_| "Windows wouldn't save this network.".to_string())?;

    let name = profile_name(&network.ssid);
    wlan.connect(&name, &network.ssid).map_err(|reason| {
        wlan.delete_profile(&name);
        failure_text(reason, false).to_string()
    })
}

/// The connection in progress, or how the last one failed. It lives here so it outlives the card.
struct Attempts(Mutex<Option<(Attempt, u64)>>);

impl Default for Attempts {
    fn default() -> Self {
        Attempts(Mutex::new(None))
    }
}

impl Attempts {
    fn current(&self, now: u64) -> Option<Attempt> {
        let held = self.0.lock().unwrap_or_else(|e| e.into_inner());
        held.as_ref().filter(|(_, at)| now.saturating_sub(*at) < ATTEMPT_LIFE_MS).map(|(attempt, _)| attempt.clone())
    }

    fn begin(&self, id: &str, now: u64) -> Result<(), String> {
        let mut held = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if held.as_ref().is_some_and(|(attempt, at)| now.saturating_sub(*at) < ATTEMPT_LIFE_MS && attempt.state == "connecting") {
            return Err("Still connecting to another network.".into());
        }
        *held = Some((Attempt { id: id.to_string(), state: "connecting", error: None }, now));
        Ok(())
    }

    fn finish(&self, result: Result<(), String>, now: u64) {
        let mut held = self.0.lock().unwrap_or_else(|e| e.into_inner());
        match result {
            Ok(()) => *held = None,
            Err(error) => {
                if let Some((attempt, at)) = held.as_mut() {
                    attempt.state = "failed";
                    attempt.error = Some(error);
                    *at = now;
                }
            }
        }
    }

    fn clear(&self) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

static ATTEMPTS: Attempts = Attempts(Mutex::new(None));

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

struct WinWlan {
    client: HANDLE,
    interface: GUID,
}

fn wide_text(raw: &[u16]) -> String {
    let end = raw.iter().position(|c| *c == 0).unwrap_or(raw.len());
    String::from_utf16_lossy(&raw[..end])
}

fn ssid_bytes(raw: &[u8], length: u32) -> Vec<u8> {
    raw[..(length as usize).min(raw.len())].to_vec()
}

impl WinWlan {
    /// None when this PC has no Wi-Fi: no adapter, or the service isn't there.
    fn open() -> Option<WinWlan> {
        unsafe {
            let (mut version, mut client) = (0, HANDLE::default());
            if WlanOpenHandle(2, None, &mut version, &mut client) != 0 {
                return None;
            }
            let mut list: *mut WLAN_INTERFACE_INFO_LIST = std::ptr::null_mut();
            let mut interface = None;
            if WlanEnumInterfaces(client, None, &mut list) == 0 && !list.is_null() {
                let first = std::ptr::addr_of!((*list).InterfaceInfo) as *const WLAN_INTERFACE_INFO;
                let all = std::slice::from_raw_parts(first, (*list).dwNumberOfItems as usize);
                interface = all.iter().find(|i| i.isState == wlan_interface_state_connected).or(all.first()).map(|i| i.InterfaceGuid);
                WlanFreeMemory(list as *const _);
            }
            match interface {
                Some(interface) => Some(WinWlan { client, interface }),
                None => {
                    WlanCloseHandle(client, None);
                    None
                }
            }
        }
    }

    fn radio_on(&self) -> bool {
        unsafe {
            let (mut size, mut data) = (0, std::ptr::null_mut());
            let asked = WlanQueryInterface(self.client, &self.interface, wlan_intf_opcode_radio_state, None, &mut size, &mut data, None);
            if asked != 0 || data.is_null() {
                return true;
            }
            let state = &*(data as *const WLAN_RADIO_STATE);
            let count = (state.dwNumberOfPhys as usize).min(state.PhyRadioState.len());
            let on = state.PhyRadioState[..count]
                .iter()
                .any(|p| p.dot11SoftwareRadioState == dot11_radio_state_on && p.dot11HardwareRadioState == dot11_radio_state_on);
            WlanFreeMemory(data);
            on
        }
    }

    fn scan(&self) -> Result<(), u32> {
        match unsafe { WlanScan(self.client, &self.interface, None, None, None) } {
            0 => Ok(()),
            code => Err(code),
        }
    }
}

impl Drop for WinWlan {
    fn drop(&mut self) {
        unsafe {
            WlanCloseHandle(self.client, None);
        }
    }
}

/// Runs on Windows' own thread, for as long as `connect` is waiting.
unsafe extern "system" fn on_notice(data: *mut L2_NOTIFICATION_DATA, context: *mut c_void) {
    let notice = &*data;
    let code = notice.NotificationCode as i32;
    let (complete, failed) = (wlan_notification_acm_connection_complete.0, wlan_notification_acm_connection_attempt_fail.0);
    if notice.NotificationSource != WLAN_NOTIFICATION_SOURCE_ACM || (code != complete && code != failed) || notice.pData.is_null() {
        return;
    }
    let detail = &*(notice.pData as *const WLAN_CONNECTION_NOTIFICATION_DATA);
    let reason = if code == failed && detail.wlanReasonCode == 0 { 1 } else { detail.wlanReasonCode };
    let sender = &*(context as *const Sender<(Vec<u8>, u32)>);
    let _ = sender.send((ssid_bytes(&detail.dot11Ssid.ucSSID, detail.dot11Ssid.uSSIDLength), reason));
}

impl Wlan for WinWlan {
    fn networks(&self) -> Result<Vec<RawNetwork>, u32> {
        unsafe {
            let mut list: *mut WLAN_AVAILABLE_NETWORK_LIST = std::ptr::null_mut();
            let code = WlanGetAvailableNetworkList(self.client, &self.interface, 0, None, &mut list);
            if code != 0 || list.is_null() {
                return Err(code);
            }
            let first = std::ptr::addr_of!((*list).Network) as *const WLAN_AVAILABLE_NETWORK;
            let rows = std::slice::from_raw_parts(first, (*list).dwNumberOfItems as usize)
                .iter()
                .filter(|n| n.dot11BssType == dot11_BSS_type_infrastructure)
                .map(|n| RawNetwork {
                    ssid: ssid_bytes(&n.dot11Ssid.ucSSID, n.dot11Ssid.uSSIDLength),
                    signal: n.wlanSignalQuality,
                    auth: auth_of(n.dot11DefaultAuthAlgorithm.0),
                    profile: (n.dwFlags & WLAN_AVAILABLE_NETWORK_HAS_PROFILE != 0).then(|| wide_text(&n.strProfileName)),
                    connected: n.dwFlags & WLAN_AVAILABLE_NETWORK_CONNECTED != 0,
                })
                .collect();
            WlanFreeMemory(list as *const _);
            Ok(rows)
        }
    }

    /// Never overwrites: a profile of the same name is the owner's, and a failed attempt would delete it.
    fn set_profile(&self, xml: &str) -> Result<(), u32> {
        let mut reason = 0;
        match unsafe { WlanSetProfile(self.client, &self.interface, 0, &HSTRING::from(xml), PCWSTR::null(), false, None, &mut reason) } {
            0 => Ok(()),
            code => Err(code),
        }
    }

    fn connect(&self, profile: &str, ssid: &[u8]) -> Result<(), u32> {
        unsafe {
            let (sender, results) = channel::<(Vec<u8>, u32)>();
            let context = Box::into_raw(Box::new(sender));
            let listening = WlanRegisterNotification(
                self.client,
                WLAN_NOTIFICATION_SOURCE_ACM,
                false,
                Some(on_notice),
                Some(context as *const c_void),
                None,
                None,
            );
            if listening != 0 {
                drop(Box::from_raw(context));
                return Err(listening);
            }
            let name = HSTRING::from(profile);
            let parameters = WLAN_CONNECTION_PARAMETERS {
                wlanConnectionMode: wlan_connection_mode_profile,
                strProfile: PCWSTR(name.as_ptr()),
                dot11BssType: dot11_BSS_type_any,
                ..Default::default()
            };
            let started = WlanConnect(self.client, &self.interface, &parameters, None);
            let mut outcome = Err(if started == 0 { TIMED_OUT } else { started });
            if started == 0 {
                let deadline = Instant::now() + WAIT_FOR_RESULT;
                while let Ok((seen, reason)) = results.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                    if seen == ssid {
                        outcome = if reason == 0 { Ok(()) } else { Err(reason) };
                        break;
                    }
                }
            }
            // Waits for a callback in progress, so the sender is free to go after it.
            WlanRegisterNotification(self.client, WLAN_NOTIFICATION_SOURCE_NONE, false, None, None, None, None);
            drop(Box::from_raw(context));
            outcome
        }
    }

    fn delete_profile(&self, name: &str) {
        unsafe {
            WlanDeleteProfile(self.client, &self.interface, &HSTRING::from(name), None);
        }
    }
}

#[tauri::command(async)]
pub fn wifi_networks() -> WifiList {
    let attempt = ATTEMPTS.current(now());
    let Some(wlan) = WinWlan::open() else {
        return WifiList { adapter: false, on: false, permission: true, attempt, networks: Vec::new() };
    };
    if !wlan.radio_on() {
        return WifiList { adapter: true, on: false, permission: true, attempt, networks: Vec::new() };
    }
    match wlan.networks() {
        Ok(raw) => WifiList { adapter: true, on: true, permission: true, attempt, networks: merge_networks(raw) },
        Err(code) => WifiList { adapter: true, on: true, permission: code != ACCESS_DENIED, attempt, networks: Vec::new() },
    }
}

/// Asks the adapter to look around. It changes nothing, so preview may do it too.
#[tauri::command(async)]
pub fn wifi_scan() -> Result<(), String> {
    let wlan = WinWlan::open().ok_or("no Wi-Fi adapter")?;
    wlan.scan().map_err(|code| format!("scan refused: {code}"))
}

/// Returns at once. Progress comes through `attempt`, so clicking away doesn't lose it.
#[tauri::command(async)]
pub fn wifi_connect(id: String, password: Option<String>) -> Result<(), String> {
    crate::preview::guard()?;
    if let Some(problem) = password.as_deref().and_then(password_problem) {
        return Err(problem.to_string());
    }
    ATTEMPTS.begin(&id, now())?;
    std::thread::spawn(move || {
        let result = match WinWlan::open() {
            Some(wlan) => connect_network(&wlan, &id, password),
            None => Err("This PC has no Wi-Fi adapter.".to_string()),
        };
        ATTEMPTS.finish(result, now());
    });
    Ok(())
}

#[tauri::command(async)]
pub fn wifi_disconnect() -> Result<(), String> {
    crate::preview::guard()?;
    ATTEMPTS.clear();
    let wlan = WinWlan::open().ok_or("no Wi-Fi adapter")?;
    match unsafe { WlanDisconnect(wlan.client, &wlan.interface, None) } {
        0 => Ok(()),
        code => Err(format!("disconnect refused: {code}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn raw(ssid: &[u8], signal: u32, auth: Auth) -> RawNetwork {
        RawNetwork { ssid: ssid.to_vec(), signal, auth, profile: None, connected: false }
    }

    #[derive(Default)]
    struct FakeWlan {
        networks: Vec<RawNetwork>,
        connect_fails_with: Option<u32>,
        set_profile_fails: bool,
        set: RefCell<Vec<String>>,
        connected: RefCell<Vec<String>>,
        deleted: RefCell<Vec<String>>,
    }

    impl Wlan for FakeWlan {
        fn networks(&self) -> Result<Vec<RawNetwork>, u32> {
            Ok(self.networks.clone())
        }
        fn set_profile(&self, xml: &str) -> Result<(), u32> {
            self.set.borrow_mut().push(xml.to_string());
            if self.set_profile_fails { Err(1) } else { Ok(()) }
        }
        fn connect(&self, profile: &str, _ssid: &[u8]) -> Result<(), u32> {
            self.connected.borrow_mut().push(profile.to_string());
            self.connect_fails_with.map_or(Ok(()), Err)
        }
        fn delete_profile(&self, name: &str) {
            self.deleted.borrow_mut().push(name.to_string());
        }
    }

    #[test]
    fn profile_escapes_xml_in_password_and_name() {
        let xml = profile_xml(b"a&b<c>", Auth::Wpa2, Some("a&b<c>\"d'e"));
        assert!(xml.contains("<name>a&amp;b&lt;c&gt;</name>"));
        assert!(xml.contains("<keyMaterial>a&amp;b&lt;c&gt;&quot;d&apos;e</keyMaterial>"));
    }

    #[test]
    fn profile_uses_the_hex_ssid_so_any_bytes_survive() {
        let xml = profile_xml(&[0xFF, 0x41, 0x00], Auth::Open, None);
        assert!(xml.contains("<hex>FF4100</hex>"));
    }

    #[test]
    fn profile_covers_open_wpa2_and_wpa3() {
        let open = profile_xml(b"x", Auth::Open, None);
        assert!(open.contains("<authentication>open</authentication><encryption>none</encryption>"));
        assert!(!open.contains("sharedKey"));
        let wpa2 = profile_xml(b"x", Auth::Wpa2, Some("password"));
        assert!(wpa2.contains("<authentication>WPA2PSK</authentication><encryption>AES</encryption>"));
        assert!(wpa2.contains("<keyType>passPhrase</keyType>"));
        let wpa3 = profile_xml(b"x", Auth::Wpa3, Some("password"));
        assert!(wpa3.contains("<authentication>WPA3SAE</authentication><encryption>AES</encryption>"));
    }

    #[test]
    fn networks_merge_by_name_keeping_the_strongest() {
        let merged = merge_networks(vec![raw(b"Home", 40, Auth::Wpa2), raw(b"Home", 90, Auth::Wpa2)]);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].signal, 90);
    }

    #[test]
    fn a_merged_network_stays_saved_and_connected() {
        let mut saved = raw(b"Home", 40, Auth::Wpa2);
        saved.profile = Some("Home".into());
        saved.connected = true;
        let merged = merge_networks(vec![saved, raw(b"Home", 90, Auth::Wpa2)]);
        assert!(merged[0].saved && merged[0].connected);
        assert_eq!(merged[0].signal, 90);
    }

    #[test]
    fn connected_comes_first_then_saved_then_by_signal() {
        let mut connected = raw(b"C", 10, Auth::Wpa2);
        connected.connected = true;
        connected.profile = Some("C".into());
        let mut saved = raw(b"S", 20, Auth::Wpa2);
        saved.profile = Some("S".into());
        let merged = merge_networks(vec![raw(b"Weak", 30, Auth::Wpa2), raw(b"Strong", 95, Auth::Wpa2), saved, connected]);
        let names: Vec<_> = merged.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, ["C", "S", "Strong", "Weak"]);
    }

    #[test]
    fn accents_and_emoji_in_names_survive() {
        let name = "Café ☕";
        assert_eq!(merge_networks(vec![raw(name.as_bytes(), 50, Auth::Open)])[0].name, name);
    }

    #[test]
    fn hidden_networks_are_left_out() {
        assert!(merge_networks(vec![raw(b"", 90, Auth::Wpa2)]).is_empty());
    }

    #[test]
    fn enterprise_networks_are_marked_for_settings() {
        let merged = merge_networks(vec![raw(b"Office", 50, Auth::Enterprise)]);
        assert_eq!(merged[0].auth, Auth::Enterprise);
        let wlan = FakeWlan { networks: vec![raw(b"Office", 50, Auth::Enterprise)], ..Default::default() };
        assert!(connect_network(&wlan, &network_id(b"Office"), Some("password".into())).is_err());
        assert!(wlan.set.borrow().is_empty());
    }

    #[test]
    fn auth_comes_from_windows_algorithm() {
        assert_eq!(auth_of(1), Auth::Open);
        assert_eq!(auth_of(7), Auth::Wpa2);
        assert_eq!(auth_of(9), Auth::Wpa3);
        assert_eq!(auth_of(6), Auth::Enterprise);
        assert_eq!(auth_of(8), Auth::Enterprise);
        assert_eq!(auth_of(11), Auth::Enterprise);
        assert_eq!(auth_of(2), Auth::Other);
    }

    #[test]
    fn passwords_must_be_8_to_63_characters() {
        assert!(password_problem("1234567").is_some());
        assert!(password_problem("12345678").is_none());
        assert!(password_problem(&"x".repeat(63)).is_none());
        assert!(password_problem(&"x".repeat(64)).is_some());
    }

    #[test]
    fn a_failed_new_connection_removes_its_profile() {
        let wlan = FakeWlan { networks: vec![raw(b"New", 50, Auth::Wpa2)], connect_fails_with: Some(KEY_MISMATCH), ..Default::default() };
        let result = connect_network(&wlan, &network_id(b"New"), Some("wrongpassword".into()));
        assert_eq!(result, Err("Wrong password.".to_string()));
        assert_eq!(*wlan.deleted.borrow(), ["New"]);
    }

    #[test]
    fn a_new_connection_that_works_keeps_its_profile() {
        let wlan = FakeWlan { networks: vec![raw(b"New", 50, Auth::Wpa2)], ..Default::default() };
        assert!(connect_network(&wlan, &network_id(b"New"), Some("goodpassword".into())).is_ok());
        assert!(wlan.deleted.borrow().is_empty());
    }

    #[test]
    fn a_saved_network_connects_by_its_profile_name_without_changing_it() {
        let mut saved = raw(b"Home", 50, Auth::Wpa2);
        saved.profile = Some("My home".into());
        let wlan = FakeWlan { networks: vec![saved], connect_fails_with: Some(KEY_MISMATCH), ..Default::default() };
        let result = connect_network(&wlan, &network_id(b"Home"), None);
        assert_eq!(*wlan.connected.borrow(), ["My home"]);
        assert!(wlan.set.borrow().is_empty());
        assert!(wlan.deleted.borrow().is_empty(), "a saved network's profile is the owner's");
        assert!(result.unwrap_err().contains("Settings"));
    }

    #[test]
    fn a_name_that_is_not_valid_text_can_still_be_connected() {
        let ssid = [0xFF, 0xFE, 0x41];
        let wlan = FakeWlan { networks: vec![raw(&ssid, 50, Auth::Wpa2)], ..Default::default() };
        let id = network_id(&ssid);
        assert_eq!(id, "FFFE41");
        assert!(connect_network(&wlan, &id, Some("goodpassword".into())).is_ok());
        assert!(wlan.set.borrow()[0].contains("<hex>FFFE41</hex>"));
    }

    #[test]
    fn a_secured_new_network_needs_a_password() {
        let wlan = FakeWlan { networks: vec![raw(b"New", 50, Auth::Wpa2)], ..Default::default() };
        assert!(connect_network(&wlan, &network_id(b"New"), None).is_err());
        assert!(wlan.set.borrow().is_empty());
    }

    #[test]
    fn a_network_gone_from_range_says_so() {
        let wlan = FakeWlan::default();
        assert!(connect_network(&wlan, "AABB", None).unwrap_err().contains("range"));
    }

    #[test]
    fn a_profile_windows_refuses_leaves_nothing_to_remove() {
        let wlan = FakeWlan { networks: vec![raw(b"New", 50, Auth::Wpa2)], set_profile_fails: true, ..Default::default() };
        assert!(connect_network(&wlan, &network_id(b"New"), Some("goodpassword".into())).is_err());
        assert!(wlan.connected.borrow().is_empty());
        assert!(wlan.deleted.borrow().is_empty());
    }

    #[test]
    fn only_one_connection_can_start_at_a_time() {
        for _ in 0..200 {
            let attempts = Attempts::default();
            let started = std::sync::atomic::AtomicUsize::new(0);
            let gate = std::sync::Barrier::new(8);
            std::thread::scope(|scope| {
                for _ in 0..8 {
                    scope.spawn(|| {
                        gate.wait();
                        if attempts.begin("AA", 0).is_ok() {
                            started.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                        }
                    });
                }
            });
            assert_eq!(started.into_inner(), 1);
        }
    }

    #[test]
    fn the_attempt_outlives_the_card_and_never_holds_the_password() {
        let attempts = Attempts::default();
        attempts.begin("AA", 0).unwrap();
        assert_eq!(attempts.current(1000).unwrap().state, "connecting");
        let wlan = FakeWlan { networks: vec![raw(b"New", 50, Auth::Wpa2)], connect_fails_with: Some(KEY_MISMATCH), ..Default::default() };
        attempts.finish(connect_network(&wlan, &network_id(b"New"), Some("hunter2hunter2".into())), 2000);
        let seen = attempts.current(3000).unwrap();
        assert_eq!(seen.state, "failed");
        assert_eq!(seen.error.as_deref(), Some("Wrong password."));
        assert!(!serde_json::to_string(&seen).unwrap().contains("hunter2"));
    }

    #[test]
    fn one_attempt_at_a_time() {
        let attempts = Attempts::default();
        attempts.begin("AA", 0).unwrap();
        assert!(attempts.begin("BB", 10).is_err());
    }

    #[test]
    fn a_connection_that_works_leaves_no_attempt() {
        let attempts = Attempts::default();
        attempts.begin("AA", 0).unwrap();
        attempts.finish(Ok(()), 10);
        assert!(attempts.current(20).is_none());
    }

    #[test]
    fn an_old_failure_stops_showing() {
        let attempts = Attempts::default();
        attempts.begin("AA", 0).unwrap();
        attempts.finish(Err("Wrong password.".into()), 10);
        assert!(attempts.current(10 + ATTEMPT_LIFE_MS - 1).is_some());
        assert!(attempts.current(10 + ATTEMPT_LIFE_MS).is_none());
    }

    #[test]
    fn a_stuck_attempt_cannot_block_the_next() {
        let attempts = Attempts::default();
        attempts.begin("AA", 0).unwrap();
        assert!(attempts.begin("BB", ATTEMPT_LIFE_MS).is_ok());
    }

    #[test]
    fn failures_read_plainly() {
        assert_eq!(failure_text(KEY_MISMATCH, false), "Wrong password.");
        assert_eq!(failure_text(TIMED_OUT, false), "The connection timed out.");
        assert_eq!(failure_text(12345, false), "Windows couldn't connect to this network.");
    }
}
