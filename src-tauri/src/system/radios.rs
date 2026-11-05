//! Wi-Fi and Bluetooth on or off, for the Quick Settings card.

use serde::Serialize;
use windows::Devices::Radios::{Radio, RadioAccessStatus, RadioKind, RadioState};

#[derive(Serialize, Debug)]
pub struct RadioInfo {
    kind: &'static str,
    on: bool,
}

/// Only these, whatever the page asks.
fn radio_kind(kind: &str) -> Option<RadioKind> {
    match kind {
        "wifi" => Some(RadioKind::WiFi),
        "bluetooth" => Some(RadioKind::Bluetooth),
        _ => None,
    }
}

fn kind_name(kind: RadioKind) -> Option<&'static str> {
    match kind {
        RadioKind::WiFi => Some("wifi"),
        RadioKind::Bluetooth => Some("bluetooth"),
        _ => None,
    }
}

fn merge_radios(radios: Vec<(&'static str, bool)>) -> Vec<RadioInfo> {
    let mut rows: Vec<RadioInfo> = Vec::new();
    for (kind, on) in radios {
        match rows.iter_mut().find(|r| r.kind == kind) {
            Some(row) => row.on |= on,
            None => rows.push(RadioInfo { kind, on }),
        }
    }
    rows
}

fn all_radios() -> windows::core::Result<Vec<Radio>> {
    Ok(Radio::GetRadiosAsync()?.get()?.into_iter().collect())
}

#[tauri::command(async)]
pub fn radios_state() -> Vec<RadioInfo> {
    let radios = all_radios().unwrap_or_default();
    merge_radios(
        radios
            .iter()
            .filter_map(|r| {
                let kind = kind_name(r.Kind().ok()?)?;
                Some((kind, r.State().ok()? == RadioState::On))
            })
            .collect(),
    )
}

#[tauri::command(async)]
pub fn radio_set(kind: String, on: bool) -> Result<(), String> {
    crate::preview::guard()?;
    let wanted = radio_kind(&kind).ok_or("unknown radio")?;
    let unable = |_| "Windows couldn't change this radio.".to_string();
    let access = Radio::RequestAccessAsync().and_then(|a| a.get()).map_err(unable)?;
    if access != RadioAccessStatus::Allowed {
        return Err("Windows didn't allow Shelf to change this radio.".into());
    }
    let state = if on { RadioState::On } else { RadioState::Off };
    let mut found = false;
    for radio in all_radios().map_err(unable)? {
        if radio.Kind().ok() != Some(wanted) {
            continue;
        }
        found = true;
        let result = radio.SetStateAsync(state).and_then(|r| r.get()).map_err(unable)?;
        if result != RadioAccessStatus::Allowed {
            return Err("Windows didn't allow Shelf to change this radio.".into());
        }
    }
    if found { Ok(()) } else { Err("This PC doesn't have that radio.".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_radios_can_be_set() {
        assert_eq!(radio_kind("wifi"), Some(RadioKind::WiFi));
        assert_eq!(radio_kind("bluetooth"), Some(RadioKind::Bluetooth));
        assert_eq!(radio_kind("fm"), None);
        assert_eq!(radio_kind(""), None);
    }

    #[test]
    fn each_kind_has_one_row() {
        let rows = merge_radios(vec![("wifi", false), ("bluetooth", false), ("wifi", true)]);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].kind, "wifi");
        assert!(rows[0].on, "on if any radio of that kind is");
    }
}
