// Throwaway read-only probes. Deleted before the commit.
use std::time::Instant;
use windows::core::{Interface, BSTR, GUID, HSTRING, PCWSTR};
use windows::Devices::Radios::Radio;
use windows::UI::Notifications::Management::UserNotificationListener;
use windows::Win32::Foundation::{HANDLE, PROPERTYKEY};
use windows::Win32::Media::Audio::{
    eMultimedia, eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator, ISimpleAudioVolume,
    MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
};
use windows::Win32::NetworkManagement::WiFi::*;
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_MULTITHREADED, STGM_READ};
use windows::Win32::System::Wmi::{IWbemLocator, WbemLocator, WBEM_FLAG_FORWARD_ONLY, WBEM_FLAG_RETURN_IMMEDIATELY, WBEM_INFINITE};
use windows::Win32::UI::Shell::{BHID_EnumItems, FOLDERID_AppsFolder, IEnumShellItems, IShellItem, SHCreateItemFromParsingName, SHGetKnownFolderItem, KF_FLAG_DEFAULT, SIGDN_NORMALDISPLAY};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;

#[test]
#[ignore]
fn audio() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).unwrap();
        let list = devices.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE).unwrap();
        println!("PROBE outputs: {} active", list.GetCount().unwrap());
        let key = PROPERTYKEY { fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0), pid: 14 };
        if let Ok(first) = list.Item(0) {
            let store: IPropertyStore = first.OpenPropertyStore(STGM_READ).unwrap();
            let named = crate::apps::spike_store_string(&store, &key).is_some();
            println!("PROBE output friendly name readable: {named}");
        }
        let speaker = devices.GetDefaultAudioEndpoint(eRender, eMultimedia).unwrap();
        let manager: IAudioSessionManager2 = speaker.Activate(CLSCTX_ALL, None).unwrap();
        let sessions = manager.GetSessionEnumerator().unwrap();
        let count = sessions.GetCount().unwrap();
        let mut with_pid = 0;
        let mut with_volume = 0;
        for i in 0..count {
            let control = sessions.GetSession(i).unwrap();
            let two: IAudioSessionControl2 = control.cast().unwrap();
            if two.GetProcessId().is_ok_and(|p| p != 0) {
                with_pid += 1;
            }
            let volume: ISimpleAudioVolume = control.cast().unwrap();
            if volume.GetMasterVolume().is_ok() {
                with_volume += 1;
            }
        }
        println!("PROBE sessions: {count}, with a process {with_pid}, with a readable volume {with_volume}");
    }
}

#[test]
#[ignore]
fn wifi() {
    unsafe {
        let mut version = 0;
        let mut client = HANDLE::default();
        println!("PROBE wlan open: {}", WlanOpenHandle(2, None, &mut version, &mut client));
        let mut list: *mut WLAN_INTERFACE_INFO_LIST = std::ptr::null_mut();
        println!("PROBE wlan interfaces: {}", WlanEnumInterfaces(client, None, &mut list));
        let count = (*list).dwNumberOfItems as usize;
        println!("PROBE adapters: {count}");
        let first = std::ptr::addr_of!((*list).InterfaceInfo) as *const WLAN_INTERFACE_INFO;
        for info in std::slice::from_raw_parts(first, count) {
            let mut nets: *mut WLAN_AVAILABLE_NETWORK_LIST = std::ptr::null_mut();
            let code = WlanGetAvailableNetworkList(client, &info.InterfaceGuid, 0, None, &mut nets);
            println!("PROBE network list code: {code} (5 would mean refused)");
            if code == 0 {
                let n = (*nets).dwNumberOfItems as usize;
                let items = std::slice::from_raw_parts(std::ptr::addr_of!((*nets).Network) as *const WLAN_AVAILABLE_NETWORK, n);
                let saved = items.iter().filter(|i| !i.strProfileName[0] == 0).count();
                let named = items.iter().filter(|i| i.dot11Ssid.uSSIDLength > 0).count();
                println!("PROBE networks: {n} rows, {named} with a name, {saved} with a saved profile");
                WlanFreeMemory(nets as *const _);
            }
        }
        WlanFreeMemory(list as *const _);
        WlanCloseHandle(client, None);
    }
}

#[test]
#[ignore]
fn radios() {
    let radios = Radio::GetRadiosAsync().unwrap().get();
    match radios {
        Ok(list) => {
            for r in list {
                println!("PROBE radio: {:?} {:?}", r.Kind().map(|k| k.0), r.State().map(|s| s.0));
            }
        }
        Err(e) => println!("PROBE radios failed: {e}"),
    }
}

#[test]
#[ignore]
fn brightness_wmi() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let locator: IWbemLocator = CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER).unwrap();
        let services = locator.ConnectServer(&BSTR::from("ROOT\\WMI"), &BSTR::new(), &BSTR::new(), &BSTR::new(), 0, &BSTR::new(), None);
        match services {
            Err(e) => println!("PROBE wmi connect failed: {e}"),
            Ok(s) => {
                let rows = s.ExecQuery(&BSTR::from("WQL"), &BSTR::from("SELECT CurrentBrightness FROM WmiMonitorBrightness"), WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, None);
                match rows {
                    Err(e) => println!("PROBE wmi query failed: {e}"),
                    Ok(rows) => {
                        let mut row = [None];
                        let mut got = 0;
                        let _ = rows.Next(WBEM_INFINITE, &mut row, &mut got).ok();
                        println!("PROBE wmi brightness rows: {got}");
                        let methods = s.GetObject(&BSTR::from("WmiMonitorBrightnessMethods"), Default::default(), None, None, None);
                        println!("PROBE wmi set method class reachable: {}", methods.is_ok());
                    }
                }
            }
        }
    }
}

#[test]
#[ignore]
fn apps_folder() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let start = Instant::now();
        let folder: IShellItem = SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None).unwrap();
        let items: IEnumShellItems = folder.BindToHandler(None, &BHID_EnumItems).unwrap();
        let mut count = 0;
        let mut named = 0;
        loop {
            let mut one = [None];
            let mut got = 0;
            if items.Next(&mut one, Some(&mut got)).is_err() || got == 0 {
                break;
            }
            count += 1;
            if one[0].as_ref().unwrap().GetDisplayName(SIGDN_NORMALDISPLAY).is_ok() {
                named += 1;
            }
        }
        println!("PROBE apps: {count}, named {named}, {} ms", start.elapsed().as_millis());
    }
}

#[test]
#[ignore]
fn files_search() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let start = Instant::now();
        let query = "search-ms:query=readme&crumb=location:C%3A%5CUsers&";
        let item: windows::core::Result<IShellItem> = SHCreateItemFromParsingName(&HSTRING::from(query), None);
        match item {
            Err(e) => println!("PROBE search-ms failed: {e}"),
            Ok(item) => match item.BindToHandler::<_, IEnumShellItems>(None, &BHID_EnumItems) {
                Err(e) => println!("PROBE search enum failed: {e}"),
                Ok(items) => {
                    let mut count = 0;
                    let mut first_ms = None;
                    while count < 20 {
                        let mut one = [None];
                        let mut got = 0;
                        if items.Next(&mut one, Some(&mut got)).is_err() || got == 0 {
                            break;
                        }
                        count += 1;
                        first_ms.get_or_insert(start.elapsed().as_millis());
                    }
                    println!("PROBE file search: {count} results (capped at 20), first after {first_ms:?} ms, all {} ms", start.elapsed().as_millis());
                }
            },
        }
        let _ = PCWSTR::null();
    }
}

#[test]
#[ignore]
fn notifications() {
    match UserNotificationListener::Current() {
        Err(e) => println!("PROBE notification listener unavailable: {e}"),
        Ok(l) => println!("PROBE notification access status: {:?}", l.GetAccessStatus().map(|s| s.0)),
    }
}
