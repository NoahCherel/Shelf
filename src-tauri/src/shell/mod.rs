//! The Windows shell: taskbar, appbar and the events around them.

pub mod appbar;
pub mod dock;
pub mod events;
pub mod taskbar;

use windows::core::w;
use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
use windows::Win32::System::Threading::CreateMutexW;

/// Two docks would fight over the taskbar and the screen edge. The handle is
/// left open on purpose: Windows releases it when the process ends.
pub fn already_running() -> bool {
    unsafe {
        let _ = CreateMutexW(None, false, w!("dev.personal.shelf.instance"));
        GetLastError() == ERROR_ALREADY_EXISTS
    }
}
