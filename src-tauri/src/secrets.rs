//! Keys encrypted with DPAPI for the current Windows user. The page can store,
//! check and delete a key, but only Rust ever reads one back (see `net.rs`).

use std::path::{Path, PathBuf};
use std::slice;

use windows::core::w;
use windows::Win32::Foundation::{LocalFree, HLOCAL};
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};

use crate::store::{app_dir, valid_name};

fn secrets_dir() -> PathBuf {
    app_dir().join("secrets")
}

fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
    CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
}

unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
    let bytes = slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
    let _ = LocalFree(Some(HLOCAL(out.pbData as *mut _)));
    bytes
}

fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(&blob(plain), w!("Shelf"), None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            .map_err(|e| e.to_string())?;
        Ok(take(out))
    }
}

fn unprotect(sealed: &[u8]) -> Option<Vec<u8>> {
    let mut out = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(&blob(sealed), None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out).ok()?;
        Some(take(out))
    }
}

fn path_in(dir: &Path, id: &str) -> Option<PathBuf> {
    valid_name(id).then(|| dir.join(format!("{id}.dpapi")))
}

fn set_in(dir: &Path, id: &str, value: &str) -> Result<(), String> {
    let path = path_in(dir, id).ok_or("invalid secret id")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::write(path, protect(value.as_bytes())?).map_err(|e| e.to_string())
}

fn get_in(dir: &Path, id: &str) -> Option<String> {
    let sealed = std::fs::read(path_in(dir, id)?).ok()?;
    String::from_utf8(unprotect(&sealed)?).ok()
}

fn has_in(dir: &Path, id: &str) -> bool {
    path_in(dir, id).is_some_and(|p| p.exists())
}

fn delete_in(dir: &Path, id: &str) -> Result<(), String> {
    let path = path_in(dir, id).ok_or("invalid secret id")?;
    match std::fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// For `net.rs` only; deliberately not a command.
pub fn get(id: &str) -> Option<String> {
    get_in(&secrets_dir(), id)
}

#[tauri::command(async)]
pub fn secret_set(id: String, value: String) -> Result<(), String> {
    set_in(&secrets_dir(), &id, &value)
}

#[tauri::command(async)]
pub fn secret_has(id: String) -> bool {
    has_in(&secrets_dir(), &id)
}

#[tauri::command(async)]
pub fn secret_delete(id: String) -> Result<(), String> {
    delete_in(&secrets_dir(), &id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("shelf-secrets-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn secret_round_trips_through_dpapi_and_file_is_not_plaintext() {
        let dir = temp_dir("round");
        set_in(&dir, "stripe", "rk_live_abc123").unwrap();
        assert!(has_in(&dir, "stripe"));
        assert_eq!(get_in(&dir, "stripe").unwrap(), "rk_live_abc123");
        let raw = std::fs::read(dir.join("stripe.dpapi")).unwrap();
        let text = String::from_utf8_lossy(&raw);
        assert!(!text.contains("rk_live_abc123"));
        // UTF-16 would slip past the check above.
        let utf16: Vec<u8> = "rk_live_abc123".encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        assert!(!raw.windows(utf16.len()).any(|w| w == utf16.as_slice()));
    }

    #[test]
    fn deleted_secret_is_gone() {
        let dir = temp_dir("delete");
        set_in(&dir, "github", "ghp_x").unwrap();
        delete_in(&dir, "github").unwrap();
        assert!(!has_in(&dir, "github"));
        assert!(get_in(&dir, "github").is_none());
        delete_in(&dir, "github").unwrap();
    }

    #[test]
    fn secret_ids_cannot_leave_the_folder() {
        let dir = temp_dir("ids");
        assert!(set_in(&dir, "../evil", "x").is_err());
        assert!(!has_in(&dir, "../evil"));
    }
}
