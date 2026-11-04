//! Machine facts for widgets, and a few Windows settings.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::System;
use tauri::State;
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

const CPU_REFRESH_INTERVAL: Duration = Duration::from_secs(1);
const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";

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

#[tauri::command(async)]
pub fn system_stats(monitor: State<'_, Mutex<SysMonitor>>) -> SysStats {
    let mut monitor = monitor.lock().unwrap();
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

fn reg() -> std::process::Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut cmd = std::process::Command::new("reg");
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Read from Windows every time, so it reflects a change made in Task Manager's list.
#[tauri::command(async)]
pub fn autostart_get() -> bool {
    reg().args(["query", RUN_KEY, "/v", "Shelf"]).status().is_ok_and(|s| s.success())
}

#[tauri::command(async)]
pub fn autostart_set(on: bool) -> bool {
    let mut cmd = reg();
    if on {
        let exe = std::env::current_exe().unwrap_or_default();
        cmd.args(["add", RUN_KEY, "/v", "Shelf", "/t", "REG_SZ", "/f", "/d"])
            .arg(format!("\"{}\"", exe.display()));
    } else {
        cmd.args(["delete", RUN_KEY, "/v", "Shelf", "/f"]);
    }
    cmd.status().is_ok_and(|s| s.success())
}

#[tauri::command]
pub fn open_url(url: String) {
    if url.starts_with("http://") || url.starts_with("https://") {
        let _ = std::process::Command::new("explorer").arg(url).spawn();
    }
}
