//! Airplane mode, Do not disturb, Night light and Energy saver. Windows has no public switch for
//! any of them, so each uses what its own Settings uses. An update could break one: reads then come
//! back None and the card links to Settings instead of showing a switch that does nothing.

use std::ffi::c_void;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use windows::core::{interface, w, IUnknown, IUnknown_Vtbl, BOOL, GUID, HRESULT};
use windows::Win32::Foundation::{LocalFree, HLOCAL};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED};
use windows::Win32::System::Power::{
    GetSystemPowerStatus, PowerGetActiveScheme, PowerReadDCValueIndex, PowerSetActiveScheme, PowerWriteDCValueIndex, SYSTEM_POWER_STATUS,
};
use windows::Win32::System::Registry::{RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_BINARY, RRF_RT_REG_BINARY};

#[derive(Clone, Copy, PartialEq, Debug)]
enum Toggle {
    Airplane,
    Dnd,
    NightLight,
    EnergySaver,
}

/// Only these, whatever the page asks.
fn toggle_kind(kind: &str) -> Option<Toggle> {
    match kind {
        "airplane" => Some(Toggle::Airplane),
        "dnd" => Some(Toggle::Dnd),
        "night_light" => Some(Toggle::NightLight),
        "energy_saver" => Some(Toggle::EnergySaver),
        _ => None,
    }
}

#[derive(Serialize)]
pub struct Toggles {
    airplane: Option<bool>,
    dnd: Option<bool>,
    night_light: Option<bool>,
    energy_saver: Option<bool>,
}

// Night light: a binary state in the registry. Byte 18 says which, and "on" has two more bytes.
const NIGHT_LIGHT_KEY: windows::core::PCWSTR = w!("Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultAccount\\Current\\default$windows.data.bluelightreduction.bluelightreductionstate\\windows.data.bluelightreduction.bluelightreductionstate");
const STATE_BYTE: usize = 18;
const ON: u8 = 0x15;
const OFF: u8 = 0x13;
const EXTRA_AT: usize = 23;
const EXTRA: [u8; 2] = [0x10, 0x00];
const STAMP: std::ops::Range<usize> = 10..15;

fn night_light_state(data: &[u8]) -> Option<bool> {
    if data.len() <= EXTRA_AT + EXTRA.len() {
        return None;
    }
    match data[STATE_BYTE] {
        ON => Some(true),
        OFF => Some(false),
        _ => None,
    }
}

/// The time in seconds, in the five-byte form Windows stores it: seven bits a byte, low first.
fn stamp_bytes(seconds: u32) -> [u8; 5] {
    let mut out = [0u8; 5];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = ((seconds >> (7 * i)) & 0x7F) as u8 | if i < 4 { 0x80 } else { 0 };
    }
    out
}

fn read_stamp(bytes: &[u8]) -> u32 {
    bytes.iter().take(5).enumerate().fold(0, |value, (i, byte)| value | (((byte & 0x7F) as u32) << (7 * i)))
}

/// The stamp is written as Windows writes it, and always later than the last one.
fn night_light_flipped(data: &[u8], on: bool, now: u32) -> Option<Vec<u8>> {
    if night_light_state(data)? == on {
        return Some(data.to_vec());
    }
    let mut next = data.to_vec();
    next[STATE_BYTE] = if on { ON } else { OFF };
    if on {
        next.splice(EXTRA_AT..EXTRA_AT, EXTRA);
    } else {
        next.drain(EXTRA_AT..EXTRA_AT + EXTRA.len());
    }
    let stamp = now.max(read_stamp(&data[STAMP]).saturating_add(1));
    next[STAMP].copy_from_slice(&stamp_bytes(stamp));
    Some(next)
}

fn night_light_read() -> Option<Vec<u8>> {
    unsafe {
        let mut size = 0u32;
        let name = w!("Data");
        if RegGetValueW(HKEY_CURRENT_USER, NIGHT_LIGHT_KEY, name, RRF_RT_REG_BINARY, None, None, Some(&mut size)).is_err() {
            return None;
        }
        let mut data = vec![0u8; size as usize];
        if RegGetValueW(HKEY_CURRENT_USER, NIGHT_LIGHT_KEY, name, RRF_RT_REG_BINARY, None, Some(data.as_mut_ptr() as *mut c_void), Some(&mut size)).is_err() {
            return None;
        }
        data.truncate(size as usize);
        Some(data)
    }
}

fn night_light_set(on: bool) -> Result<(), String> {
    let unable = "Windows couldn't change Night light.".to_string();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs() as u32);
    let next = night_light_read().and_then(|data| night_light_flipped(&data, on, now)).ok_or(unable.clone())?;
    let written = unsafe { RegSetKeyValueW(HKEY_CURRENT_USER, NIGHT_LIGHT_KEY, w!("Data"), REG_BINARY.0, Some(next.as_ptr() as *const c_void), next.len() as u32) };
    written.ok().map_err(|_| unable)
}

// Do not disturb: a state the shell publishes through Windows' notification facility.
const QUIET_HOURS: u64 = 0x0d83063ea3bf1c75;
const QUIET_OFF: u32 = 0;
const QUIET_PRIORITY: u32 = 1;

#[link(name = "ntdll")]
extern "system" {
    fn NtQueryWnfStateData(name: *const u64, kind: *const c_void, scope: *const c_void, stamp: *mut u32, buffer: *mut c_void, size: *mut u32) -> i32;
    fn NtUpdateWnfStateData(name: *const u64, buffer: *const c_void, size: u32, kind: *const c_void, scope: *const c_void, stamp: u32, check: u32) -> i32;
}

fn dnd_read() -> Option<bool> {
    let (mut stamp, mut value, mut size) = (0u32, 0u32, 4u32);
    let status = unsafe { NtQueryWnfStateData(&QUIET_HOURS, std::ptr::null(), std::ptr::null(), &mut stamp, &mut value as *mut u32 as *mut c_void, &mut size) };
    (status == 0 && size == 4).then_some(value != QUIET_OFF)
}

fn dnd_set(on: bool) -> Result<(), String> {
    let value = if on { QUIET_PRIORITY } else { QUIET_OFF };
    let status = unsafe { NtUpdateWnfStateData(&QUIET_HOURS, &value as *const u32 as *const c_void, 4, std::ptr::null(), std::ptr::null(), 0, 0) };
    if status == 0 { Ok(()) } else { Err("Windows couldn't change Do not disturb.".into()) }
}

// Airplane mode: the undocumented manager behind Windows' own button. Only slots up to the last
// method used matter. "Radios enabled" is the opposite of airplane mode.
#[interface("db3afbfb-08e6-46c6-aa70-bf9a34c30ab7")]
unsafe trait IRadioManager: IUnknown {
    fn is_rm_supported(&self, supported: *mut u32) -> HRESULT;
    fn get_ui_radio_instances(&self, list: *mut *mut c_void) -> HRESULT;
    fn get_system_radio_state(&self, enabled: *mut BOOL, first: *mut i32, second: *mut i32) -> HRESULT;
    fn set_system_radio_state(&self, enabled: BOOL) -> HRESULT;
}

const RADIO_MANAGER: GUID = GUID::from_u128(0x581333f6_28db_41be_bc7a_ff201f12f3f6);

/// The manager wants a single-threaded apartment, which a command's thread may not be.
fn with_radio_manager<T: Send + 'static>(work: impl FnOnce(&IRadioManager) -> T + Send + 'static) -> Option<T> {
    std::thread::spawn(move || unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let manager: IRadioManager = CoCreateInstance(&RADIO_MANAGER, None, CLSCTX_ALL).ok()?;
        Some(work(&manager))
    })
    .join()
    .ok()
    .flatten()
}

fn airplane_read() -> Option<bool> {
    with_radio_manager(|manager| unsafe {
        let (mut enabled, mut first, mut second) = (BOOL(0), 0, 0);
        manager.get_system_radio_state(&mut enabled, &mut first, &mut second).is_ok().then_some(!enabled.as_bool())
    })
    .flatten()
}

fn airplane_set(on: bool) -> Result<(), String> {
    let worked = with_radio_manager(move |manager| unsafe { manager.set_system_radio_state(BOOL::from(!on)).is_ok() });
    if worked == Some(true) { Ok(()) } else { Err("Windows couldn't change Airplane mode.".into()) }
}

// Energy saver: Windows turns it on below a battery level, so "always" means a level of 100.
const ENERGY_SAVER_GROUP: GUID = GUID::from_u128(0xde830923_a562_41af_a086_e3a2c6bad2da);
const ENERGY_SAVER_LEVEL: GUID = GUID::from_u128(0xe69653ca_cf7f_4f05_aa73_cb833fa90ad4);
const ALWAYS: u32 = 100;
const WINDOWS_DEFAULT_LEVEL: u32 = 20;
const NO_BATTERY: u8 = 128;
const ON_MAINS: u8 = 1;
const KEPT_LEVEL_FILE: &str = "energy-saver-level.txt";

fn energy_saver_state(battery_flag: u8, status_flag: u8) -> Option<bool> {
    (battery_flag != NO_BATTERY).then_some(status_flag == 1)
}

fn threshold_to_keep(level: u32) -> Option<u32> {
    (level != ALWAYS).then_some(level)
}

fn power_status() -> Option<SYSTEM_POWER_STATUS> {
    let mut status = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut status).ok()? };
    Some(status)
}

fn energy_saver_read() -> Option<bool> {
    let status = power_status()?;
    energy_saver_state(status.BatteryFlag, status.SystemStatusFlag)
}

fn energy_saver_set(on: bool) -> Result<(), String> {
    let unable = "Windows couldn't change Energy saver.".to_string();
    let status = power_status().ok_or(unable.clone())?;
    if on && status.ACLineStatus == ON_MAINS {
        return Err("Energy saver only turns on when running on battery.".into());
    }
    let kept = crate::store::app_dir().join(KEPT_LEVEL_FILE);
    unsafe {
        let mut scheme: *mut GUID = std::ptr::null_mut();
        if PowerGetActiveScheme(None, &mut scheme).is_err() || scheme.is_null() {
            return Err(unable);
        }
        let mut level = 0u32;
        let read = PowerReadDCValueIndex(None, Some(scheme), Some(&ENERGY_SAVER_GROUP), Some(&ENERGY_SAVER_LEVEL), &mut level);
        let wanted = if on {
            if let Some(keep) = threshold_to_keep(level) {
                let _ = std::fs::write(&kept, keep.to_string());
            }
            ALWAYS
        } else {
            std::fs::read_to_string(&kept).ok().and_then(|t| t.trim().parse().ok()).unwrap_or(WINDOWS_DEFAULT_LEVEL)
        };
        let written = read == 0
            && PowerWriteDCValueIndex(None, scheme, Some(&ENERGY_SAVER_GROUP), Some(&ENERGY_SAVER_LEVEL), wanted) == 0
            && PowerSetActiveScheme(None, Some(scheme)).is_ok();
        let _ = LocalFree(Some(HLOCAL(scheme as *mut c_void)));
        if written { Ok(()) } else { Err(unable) }
    }
}

#[tauri::command(async)]
pub fn toggles_state() -> Toggles {
    Toggles {
        airplane: airplane_read(),
        dnd: dnd_read(),
        night_light: night_light_read().as_deref().and_then(night_light_state),
        energy_saver: energy_saver_read(),
    }
}

#[tauri::command(async)]
pub fn toggle_set(kind: String, on: bool) -> Result<(), String> {
    crate::preview::guard()?;
    match toggle_kind(&kind).ok_or("unknown setting")? {
        Toggle::Airplane => airplane_set(on),
        Toggle::Dnd => dnd_set(on),
        Toggle::NightLight => night_light_set(on),
        Toggle::EnergySaver => energy_saver_set(on),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u32 = 1793871914;

    fn night_light_on() -> Vec<u8> {
        let mut data = vec![
            0x43, 0x42, 0x01, 0x00, 0x0A, 0x02, 0x01, 0x00, 0x2A, 0x06, 0x84, 0x9D, 0xC8, 0xD4, 0x06, 0x2A, 0x2B, 0x0E, 0x15, 0x43, 0x42, 0x01, 0x00, 0x10, 0x00,
            0xD0, 0x0A, 0x02,
        ];
        data.resize(43, 0);
        data
    }

    #[test]
    fn night_light_reads_from_its_state_byte() {
        assert_eq!(night_light_state(&night_light_on()), Some(true));
        assert_eq!(night_light_state(&night_light_flipped(&night_light_on(), false, NOW).unwrap()), Some(false));
    }

    #[test]
    fn night_light_off_drops_two_bytes_and_on_puts_them_back() {
        let on = night_light_on();
        let off = night_light_flipped(&on, false, NOW).unwrap();
        assert_eq!(off.len(), on.len() - 2);
        assert_eq!(off[18], 0x13);
        assert_eq!(off[23], 0xD0);
        let again = night_light_flipped(&off, true, NOW).unwrap();
        assert_eq!(again.len(), on.len());
        assert_eq!(&again[23..25], &[0x10, 0x00]);
    }

    #[test]
    fn the_stamp_is_the_time_as_windows_writes_it() {
        // Read from this PC: Windows wrote AA A0 B1 D7 06 at 10:45:14 on 2026-11-05.
        assert_eq!(stamp_bytes(1793871914), [0xAA, 0xA0, 0xB1, 0xD7, 0x06]);
        assert_eq!(read_stamp(&[0xAA, 0xA0, 0xB1, 0xD7, 0x06]), 1793871914);
    }

    #[test]
    fn each_night_light_write_carries_the_time() {
        let off = night_light_flipped(&night_light_on(), false, NOW).unwrap();
        assert_eq!(read_stamp(&off[10..15]), NOW);
    }

    #[test]
    fn a_write_is_always_later_than_the_last_even_within_a_second() {
        let off = night_light_flipped(&night_light_on(), false, NOW).unwrap();
        let on = night_light_flipped(&off, true, NOW).unwrap();
        assert_eq!(read_stamp(&on[10..15]), NOW + 1);
    }

    #[test]
    fn a_clock_behind_windows_still_writes_later_than_windows() {
        let on = night_light_on();
        let stored = read_stamp(&on[10..15]);
        let off = night_light_flipped(&on, false, stored - 500).unwrap();
        assert_eq!(read_stamp(&off[10..15]), stored + 1);
    }

    #[test]
    fn a_night_light_state_of_an_unknown_shape_is_left_alone() {
        assert_eq!(night_light_state(&[0u8; 10]), None);
        let mut odd = night_light_on();
        odd[18] = 0x99;
        assert_eq!(night_light_state(&odd), None);
        assert_eq!(night_light_flipped(&odd, false, NOW), None);
        assert_eq!(night_light_flipped(&[0u8; 10], true, NOW), None);
    }

    #[test]
    fn flipping_to_the_same_state_changes_nothing() {
        let on = night_light_on();
        assert_eq!(night_light_flipped(&on, true, NOW), Some(on));
    }

    #[test]
    fn only_known_settings_can_be_set() {
        assert_eq!(toggle_kind("airplane"), Some(Toggle::Airplane));
        assert_eq!(toggle_kind("dnd"), Some(Toggle::Dnd));
        assert_eq!(toggle_kind("night_light"), Some(Toggle::NightLight));
        assert_eq!(toggle_kind("energy_saver"), Some(Toggle::EnergySaver));
        assert_eq!(toggle_kind("calc.exe"), None);
    }

    #[test]
    fn energy_saver_is_on_only_when_windows_says_so() {
        assert_eq!(energy_saver_state(128, 1), None, "no battery");
        assert_eq!(energy_saver_state(0, 1), Some(true));
        assert_eq!(energy_saver_state(0, 0), Some(false));
    }

    #[test]
    fn the_threshold_to_go_back_to_is_never_the_forcing_one() {
        assert_eq!(threshold_to_keep(30), Some(30));
        assert_eq!(threshold_to_keep(100), None);
    }
}
