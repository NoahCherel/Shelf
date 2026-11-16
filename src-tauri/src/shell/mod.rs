//! The Windows shell: taskbar, appbar and the events around them.

pub mod appbar;
pub mod autohide;
pub mod boot;
pub mod card;
pub mod displays;
pub mod dock;
pub mod events;
pub mod taskbar;
pub mod windows;

use ::windows::core::HSTRING;
use ::windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
use ::windows::Win32::System::Threading::{
    CreateEventW, CreateMutexW, OpenEventW, SetEvent, WaitForSingleObject, EVENT_MODIFY_STATE, INFINITE,
};
use tauri::AppHandle;

/// Two docks would fight over the taskbar and the screen edge. The handle is
/// left open on purpose: Windows releases it when the process ends.
pub fn already_running() -> bool {
    unsafe {
        let _ = CreateMutexW(None, false, &HSTRING::from(crate::preview::current().mutex));
        GetLastError() == ERROR_ALREADY_EXISTS
    }
}

/// `shelf.exe --quit` asks the running dock to exit as normally as its own menu would.
pub fn ask_to_quit() {
    unsafe {
        if let Ok(event) = OpenEventW(EVENT_MODIFY_STATE, false, &HSTRING::from(crate::preview::current().quit_event)) {
            let _ = SetEvent(event);
            let _ = CloseHandle(event);
        }
    }
}

pub fn listen_for_quit(app: AppHandle) {
    std::thread::spawn(move || unsafe {
        if let Ok(event) = CreateEventW(None, false, false, &HSTRING::from(crate::preview::current().quit_event)) {
            WaitForSingleObject(event, INFINITE);
            app.exit(0);
        }
    });
}
