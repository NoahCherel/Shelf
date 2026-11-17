//! Machine facts for widgets, and a few Windows settings.

pub mod audio;
pub mod bluetooth;
pub mod brightness;
pub mod media;
pub mod notifications;
pub mod radios;
pub mod settings_link;
pub mod status;
pub mod toggles;
pub mod tone;
pub mod tray;
pub mod wifi;

use crate::util::lock;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::System;
use tauri::State;
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
};

const CPU_REFRESH_INTERVAL: Duration = Duration::from_secs(1);
const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
/// Where Task Manager's Startup apps tab notes an app turned off, without touching `Run`.
const APPROVED_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

pub struct SysMonitor {
    sys: System,
    cpu_refreshed: Instant,
}

impl SysMonitor {
    pub fn new() -> Mutex<Self> {
        Mutex::new(Self { sys: System::new(), cpu_refreshed: Instant::now() })
    }
}

#[derive(Serialize)]
pub struct Battery {
    percent: u8,
    charging: bool,
}

#[derive(Serialize)]
pub struct SysStats {
    cpu: f32,
    mem_used: u64,
    mem_total: u64,
    battery: Option<Battery>,
}

/// None on desktops without a battery.
fn battery() -> Option<Battery> {
    let mut s = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut s).ok()? };
    if s.BatteryFlag == 128 || s.BatteryLifePercent == 255 {
        return None;
    }
    Some(Battery { percent: s.BatteryLifePercent, charging: s.ACLineStatus == 1 })
}

/// A 0 to 1 volume as a whole percentage.
fn percent(scalar: f32) -> u32 {
    (scalar.clamp(0.0, 1.0) * 100.0).round() as u32
}

#[tauri::command(async)]
pub fn system_stats(monitor: State<'_, Mutex<SysMonitor>>) -> SysStats {
    let mut monitor = lock(&monitor);
    // CPU usage is measured between two refreshes, so back-to-back calls
    // from several windows would report garbage like 100%.
    if monitor.cpu_refreshed.elapsed() >= CPU_REFRESH_INTERVAL {
        monitor.sys.refresh_cpu_usage();
        monitor.cpu_refreshed = Instant::now();
    }
    monitor.sys.refresh_memory();
    SysStats {
        cpu: monitor.sys.global_cpu_usage(),
        mem_used: monitor.sys.used_memory(),
        mem_total: monitor.sys.total_memory(),
        battery: battery(),
    }
}

/// Presses the keys in order and lets them go in reverse, like a person pressing a shortcut.
pub fn tap_keys(keys: &[VIRTUAL_KEY]) {
    let event = |vk: VIRTUAL_KEY, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: vk, dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() }, ..Default::default() },
        },
    };
    let inputs: Vec<INPUT> = keys.iter().map(|&k| event(k, false)).chain(keys.iter().rev().map(|&k| event(k, true))).collect();
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

fn reg() -> std::process::Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut cmd = std::process::Command::new("reg");
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Task Manager's mark: the first byte is odd when the app is turned off there. No mark means on.
fn approved(data: Option<&[u8]>) -> bool {
    data.and_then(|d| d.first()).is_none_or(|first| first & 1 == 0)
}

#[derive(Debug, PartialEq)]
enum Step {
    WriteRun,
    DeleteRun,
    /// Without Task Manager's mark, Windows treats the app as turned on.
    ClearApproved,
}

/// Turning it on from Shelf must undo a "Disabled" set in Task Manager, or nothing would change.
fn autostart_steps(on: bool) -> Vec<Step> {
    vec![if on { Step::WriteRun } else { Step::DeleteRun }, Step::ClearApproved]
}

/// Task Manager's mark for Shelf, if there is one.
fn approved_mark() -> Option<Vec<u8>> {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_BINARY};
    let (key, value) = (HSTRING::from(APPROVED_KEY), HSTRING::from("Shelf"));
    let mut buf = [0u8; 64];
    let mut len = buf.len() as u32;
    let found = unsafe { RegGetValueW(HKEY_CURRENT_USER, &key, &value, RRF_RT_REG_BINARY, None, Some(buf.as_mut_ptr().cast()), Some(&mut len)) };
    found.is_ok().then(|| buf[..len as usize].to_vec())
}

/// Read from Windows every time, so it reflects a change made in Task Manager's list.
#[tauri::command(async)]
pub fn autostart_get() -> bool {
    let listed = reg().args(["query", RUN_KEY, "/v", "Shelf"]).status().is_ok_and(|s| s.success());
    listed && approved(approved_mark().as_deref())
}

#[tauri::command(async)]
pub fn autostart_set(on: bool) -> Result<bool, String> {
    crate::preview::guard()?;
    let mut done = false;
    for step in autostart_steps(on) {
        let mut cmd = reg();
        match step {
            Step::WriteRun => {
                let exe = std::env::current_exe().unwrap_or_default();
                cmd.args(["add", RUN_KEY, "/v", "Shelf", "/t", "REG_SZ", "/f", "/d"]).arg(format!("\"{}\"", exe.display()));
            }
            Step::DeleteRun => {
                cmd.args(["delete", RUN_KEY, "/v", "Shelf", "/f"]);
            }
            Step::ClearApproved => {
                // Usually there is no mark to clear, so this one may fail.
                let _ = cmd.args(["delete", &format!(r"HKCU\{APPROVED_KEY}"), "/v", "Shelf", "/f"]).status();
                continue;
            }
        }
        done = cmd.status().is_ok_and(|s| s.success());
    }
    Ok(done)
}

#[cfg(test)]
mod autostart_tests {
    use super::*;

    #[test]
    fn task_manager_s_disabled_flag_reads_as_off() {
        assert!(!approved(Some(&[3, 0, 0, 0])));
        assert!(!approved(Some(&[7, 0, 0, 0])));
    }

    #[test]
    fn an_enabled_or_missing_flag_reads_as_on() {
        assert!(approved(None));
        assert!(approved(Some(&[])));
        assert!(approved(Some(&[2, 0, 0, 0])));
        assert!(approved(Some(&[6, 0, 0, 0])));
    }

    #[test]
    fn turning_on_clears_task_manager_s_flag() {
        assert_eq!(autostart_steps(true), vec![Step::WriteRun, Step::ClearApproved]);
    }

    #[test]
    fn turning_off_clears_it_too() {
        assert_eq!(autostart_steps(false), vec![Step::DeleteRun, Step::ClearApproved]);
    }
}
