//! The Bluetooth card's list of paired devices. Windows has no public way to connect one, so the
//! card shows them and sends connecting to Settings.

use serde::Serialize;
use windows::Devices::Bluetooth::{BluetoothConnectionStatus, BluetoothDevice, BluetoothLEDevice};
use windows::Devices::Enumeration::DeviceInformation;

#[derive(Serialize, Debug)]
pub struct Device {
    id: String,
    name: String,
    connected: bool,
}

/// One row per name, connected first. A device can show up once as classic and once as low energy.
fn tidy(found: Vec<Device>) -> Vec<Device> {
    let mut rows: Vec<Device> = Vec::new();
    for device in found.into_iter().filter(|d| !d.name.is_empty()) {
        match rows.iter_mut().find(|r| r.name == device.name) {
            Some(row) => row.connected |= device.connected,
            None => rows.push(device),
        }
    }
    rows.sort_by(|a, b| b.connected.cmp(&a.connected).then_with(|| a.name.cmp(&b.name)));
    rows
}

fn paired(selector: windows::core::Result<windows::core::HSTRING>, connected: impl Fn(&windows::core::HSTRING) -> bool) -> Vec<Device> {
    let found = selector.and_then(|s| DeviceInformation::FindAllAsyncAqsFilter(&s)?.get());
    let Ok(found) = found else { return Vec::new() };
    found
        .into_iter()
        .filter_map(|info| {
            let id = info.Id().ok()?;
            Some(Device { connected: connected(&id), name: info.Name().ok()?.to_string(), id: id.to_string() })
        })
        .collect()
}

#[tauri::command(async)]
pub fn bluetooth_devices() -> Vec<Device> {
    let mut found = paired(BluetoothDevice::GetDeviceSelectorFromPairingState(true), |id| {
        BluetoothDevice::FromIdAsync(id)
            .and_then(|d| d.get())
            .and_then(|d| d.ConnectionStatus())
            .is_ok_and(|s| s == BluetoothConnectionStatus::Connected)
    });
    found.extend(paired(BluetoothLEDevice::GetDeviceSelectorFromPairingState(true), |id| {
        BluetoothLEDevice::FromIdAsync(id)
            .and_then(|d| d.get())
            .and_then(|d| d.ConnectionStatus())
            .is_ok_and(|s| s == BluetoothConnectionStatus::Connected)
    }));
    tidy(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(id: &str, name: &str, connected: bool) -> Device {
        Device { id: id.into(), name: name.into(), connected }
    }

    #[test]
    fn connected_comes_first_then_by_name() {
        let rows = tidy(vec![device("1", "Zeta", false), device("2", "Alpha", false), device("3", "Mouse", true)]);
        let names: Vec<_> = rows.iter().map(|d| d.name.as_str()).collect();
        assert_eq!(names, ["Mouse", "Alpha", "Zeta"]);
    }

    #[test]
    fn a_device_seen_as_classic_and_low_energy_has_one_row() {
        let rows = tidy(vec![device("1", "Headset", false), device("2", "Headset", true)]);
        assert_eq!(rows.len(), 1);
        assert!(rows[0].connected);
    }

    #[test]
    fn nameless_devices_are_left_out() {
        assert!(tidy(vec![device("1", "", true)]).is_empty());
    }
}
