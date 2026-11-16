//! How soon after sign-in the edge is reserved (F-023), written once to the trace. With it, a slow
//! start can be put down to Windows starting Shelf late, WebView2 starting, or Shelf's own setup.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Instant;

static SETUP: OnceLock<Instant> = OnceLock::new();
static NOTED: AtomicBool = AtomicBool::new(false);

/// Called first thing in setup.
pub fn setup_began() {
    let _ = SETUP.set(Instant::now());
}

/// The three gaps, from Windows times (100 ns units since 1601) and the ms since setup began.
pub fn report(logon: i64, created: i64, now: i64, since_setup_ms: i64) -> String {
    let ms = |later: i64, earlier: i64| (later - earlier) / 10_000;
    let to_setup = ms(now, created) - since_setup_ms;
    format!(
        "edge reserved: {} ms from sign-in to Shelf starting, {to_setup} ms from starting to setup, {since_setup_ms} ms from setup to reserving",
        ms(created, logon)
    )
}

fn as_i64(t: windows::Win32::Foundation::FILETIME) -> i64 {
    ((t.dwHighDateTime as i64) << 32) | t.dwLowDateTime as i64
}

/// When this session was signed in to, in Windows time.
fn logon_time() -> Option<i64> {
    use windows::core::PWSTR;
    use windows::Win32::System::RemoteDesktop::{WTSFreeMemory, WTSQuerySessionInformationW, WTSSessionInfo, WTSINFOW, WTS_CURRENT_SERVER_HANDLE, WTS_CURRENT_SESSION};
    unsafe {
        let (mut buffer, mut bytes) = (PWSTR::null(), 0u32);
        WTSQuerySessionInformationW(Some(WTS_CURRENT_SERVER_HANDLE), WTS_CURRENT_SESSION, WTSSessionInfo, &mut buffer, &mut bytes).ok()?;
        let logon = (*(buffer.0 as *const WTSINFOW)).LogonTime;
        WTSFreeMemory(buffer.0 as *mut _);
        Some(logon)
    }
}

/// Notes the gaps the first time the edge is reserved, when the trace is on.
pub fn note_reserved() {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::System::SystemInformation::GetSystemTimeAsFileTime;
    use windows::Win32::System::Threading::{GetCurrentProcess, GetProcessTimes};
    if !crate::diag::enabled() || NOTED.swap(true, Ordering::Relaxed) {
        return;
    }
    let Some(setup) = SETUP.get() else { return };
    let (mut created, mut exit, mut kernel, mut user) = (FILETIME::default(), FILETIME::default(), FILETIME::default(), FILETIME::default());
    if unsafe { GetProcessTimes(GetCurrentProcess(), &mut created, &mut exit, &mut kernel, &mut user) }.is_err() {
        return;
    }
    let now = as_i64(unsafe { GetSystemTimeAsFileTime() });
    let Some(logon) = logon_time() else { return };
    crate::diag::note(&report(logon, as_i64(created), now, setup.elapsed().as_millis() as i64));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_report_splits_the_wait_into_its_three_parts() {
        let second = 10_000_000;
        // Signed in at 0, Shelf started 12 s later, reserved 2 s after that, setup having taken 300 ms.
        let r = report(0, 12 * second, 14 * second, 300);
        assert_eq!(r, "edge reserved: 12000 ms from sign-in to Shelf starting, 1700 ms from starting to setup, 300 ms from setup to reserving");
    }
}
