//! JSON files under %APPDATA%\Shelf\data, so state can be inspected and backed up.

use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::{AppHandle, Emitter};

pub fn app_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    Path::new(&base).join(crate::preview::current().data_folder)
}

fn data_dir() -> PathBuf {
    app_dir().join("data")
}

/// Names become file names, so nothing that could leave the folder gets through.
pub fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
}

fn load_in(dir: &Path, name: &str) -> Option<Value> {
    if !valid_name(name) {
        return None;
    }
    let path = dir.join(format!("{name}.json"));
    let text = std::fs::read_to_string(&path).ok()?;
    match serde_json::from_str(&text) {
        Ok(value) => Some(value),
        Err(_) => {
            // Keep the bad file for inspection, and start clean.
            let _ = std::fs::rename(&path, dir.join(format!("{name}.json.bak")));
            None
        }
    }
}

fn save_in(dir: &Path, name: &str, value: &Value) -> Result<(), String> {
    if !valid_name(name) {
        return Err(format!("invalid store name: {name}"));
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{name}.json.tmp"));
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join(format!("{name}.json"))).map_err(|e| e.to_string())
}

pub fn load(name: &str) -> Option<Value> {
    load_in(&data_dir(), name)
}

#[tauri::command(async)]
pub fn store_load(name: String) -> Option<Value> {
    load(&name)
}

/// Every window keeps its own copy of shared state, so each save is announced.
#[tauri::command(async)]
pub fn store_save(app: AppHandle, name: String, value: Value) -> Result<(), String> {
    save_in(&data_dir(), &name, &value)?;
    let _ = app.emit("store-changed", name);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::PathBuf;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("shelf-store-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn store_round_trips_and_writes_atomically() {
        let dir = temp_dir("round");
        save_in(&dir, "layout", &json!({ "version": 1, "ids": ["a"] })).unwrap();
        assert_eq!(load_in(&dir, "layout").unwrap()["ids"][0], "a");
        let names: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["layout.json"], "no temp file is left behind");
    }

    #[test]
    fn missing_store_file_loads_as_none() {
        assert!(load_in(&temp_dir("missing"), "nothing").is_none());
    }

    #[test]
    fn corrupt_store_file_loads_as_none_and_is_kept_as_bak() {
        let dir = temp_dir("corrupt");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("layout.json"), "{ not json").unwrap();
        assert!(load_in(&dir, "layout").is_none());
        assert!(!dir.join("layout.json").exists());
        assert_eq!(std::fs::read_to_string(dir.join("layout.json.bak")).unwrap(), "{ not json");
    }

    #[test]
    fn store_rejects_names_with_path_separators() {
        let dir = temp_dir("names");
        for bad in ["../evil", "a/b", r"a\b", "..", "", "C:evil"] {
            assert!(save_in(&dir, bad, &json!(1)).is_err(), "{bad}");
            assert!(load_in(&dir, bad).is_none(), "{bad}");
        }
    }
}
