//! Small helpers the whole of Shelf shares.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};

use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};

/// Takes a lock even if a thread panicked holding it: Shelf carries on with what's there.
pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// The last part of a path.
pub fn file_name(path: &str) -> &str {
    path.rsplit(['\\', '/']).next().unwrap_or(path)
}

/// The last part of a path, without its extension.
pub fn file_stem(path: &str) -> &str {
    let file = file_name(path);
    file.rsplit_once('.').map_or(file, |(stem, _)| stem)
}

/// Whether a Windows language id is French, in any country.
pub fn is_french(lang: u16) -> bool {
    lang & 0x3FF == 0x0C
}

/// A name for a temporary copy, so two reads at once can't remove each other's.
pub fn unique_temp_name() -> String {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    format!("{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed))
}

/// Shell objects need their own COM apartment, so they get their own short-lived thread.
pub fn on_com_thread<R: Send + 'static>(f: impl FnOnce() -> R + Send + 'static) -> Result<R, String> {
    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        f()
    })
    .join()
    .map_err(|_| "shell call failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_gives_its_last_part_and_its_stem() {
        assert_eq!(file_name(r"C:\Apps\tool.exe"), "tool.exe");
        assert_eq!(file_name("a/b.txt"), "b.txt");
        assert_eq!(file_name("alone"), "alone");
        assert_eq!(file_stem(r"C:\Apps\tool.v2.exe"), "tool.v2");
        assert_eq!(file_stem("alone"), "alone");
    }

    #[test]
    fn french_is_french_in_any_country() {
        assert!(is_french(0x040C));
        assert!(is_french(0x0C0C));
        assert!(!is_french(0x0409));
    }

    #[test]
    fn two_temporary_names_differ() {
        assert_ne!(unique_temp_name(), unique_temp_name());
    }

    #[test]
    fn a_lock_survives_a_panic_while_it_was_held() {
        let mutex = Mutex::new(1);
        let _ = std::thread::scope(|s| s.spawn(|| {
            let _held = mutex.lock().unwrap();
            panic!("on purpose");
        }).join());
        assert_eq!(*lock(&mutex), 1);
    }
}
