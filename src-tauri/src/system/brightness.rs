//! The screen's brightness, through WMI. Only built-in panels answer, so an outside monitor reads as none.

use std::sync::Mutex;

use windows::core::{w, BSTR, PCWSTR};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoSetProxyBlanket, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, EOAC_NONE,
    RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE,
};
use windows::Win32::System::Variant::{VariantClear, VARIANT, VT_BSTR, VT_I4, VT_UI1};
use windows::Win32::System::Wmi::{
    IWbemClassObject, IWbemLocator, IWbemServices, WbemLocator, WBEM_FLAG_FORWARD_ONLY, WBEM_FLAG_RETURN_IMMEDIATELY,
    WBEM_GENERIC_FLAG_TYPE,
};

const WAIT_MS: i32 = 2000;
const RPC_C_AUTHN_WINNT: u32 = 10;
const RPC_C_AUTHZ_NONE: u32 = 0;
/// WMI calls take a while, and overlapping ones could finish out of order.
static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());

fn to_level(percent: u32) -> u8 {
    percent.min(100) as u8
}

unsafe fn services() -> windows::core::Result<IWbemServices> {
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    let locator: IWbemLocator = CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER)?;
    let empty = BSTR::new();
    let wmi = locator.ConnectServer(&BSTR::from("root\\wmi"), &empty, &empty, &empty, 0, &empty, None)?;
    CoSetProxyBlanket(&wmi, RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE, PCWSTR::null(), RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE, None, EOAC_NONE)?;
    Ok(wmi)
}

unsafe fn first_row(wmi: &IWbemServices, query: &str) -> Option<IWbemClassObject> {
    let flags = WBEM_GENERIC_FLAG_TYPE(WBEM_FLAG_FORWARD_ONLY.0 | WBEM_FLAG_RETURN_IMMEDIATELY.0);
    let rows = wmi.ExecQuery(&BSTR::from("WQL"), &BSTR::from(query), flags, None).ok()?;
    let mut row = [None];
    let mut returned = 0;
    let _ = rows.Next(WAIT_MS, &mut row, &mut returned);
    row[0].take()
}

fn level_variant(level: u8) -> VARIANT {
    let mut value = VARIANT::default();
    unsafe {
        let inner = &mut *value.Anonymous.Anonymous;
        inner.vt = VT_UI1;
        inner.Anonymous.bVal = level;
    }
    value
}

fn long_variant(number: i32) -> VARIANT {
    let mut value = VARIANT::default();
    unsafe {
        let inner = &mut *value.Anonymous.Anonymous;
        inner.vt = VT_I4;
        inner.Anonymous.lVal = number;
    }
    value
}

/// None when the screen can't be adjusted this way, and the card then links to Settings.
#[tauri::command(async)]
pub fn brightness_get() -> Option<u32> {
    let _one = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
    unsafe {
        let wmi = services().ok()?;
        let row = first_row(&wmi, "SELECT CurrentBrightness FROM WmiMonitorBrightness WHERE Active=TRUE")?;
        let mut value = VARIANT::default();
        row.Get(w!("CurrentBrightness"), 0, &mut value, None, None).ok()?;
        let inner = &*value.Anonymous.Anonymous;
        let level = match inner.vt {
            VT_UI1 => Some(inner.Anonymous.bVal as u32),
            VT_I4 => Some(inner.Anonymous.lVal as u32),
            _ => None,
        };
        let _ = VariantClear(&mut value);
        level
    }
}

#[tauri::command(async)]
pub fn brightness_set(percent: u32) -> Result<(), String> {
    crate::preview::guard()?;
    let _one = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
    let unable = "Windows couldn't change the brightness.".to_string();
    unsafe {
        let wmi = services().map_err(|_| unable.clone())?;
        let target = first_row(&wmi, "SELECT * FROM WmiMonitorBrightnessMethods WHERE Active=TRUE").ok_or(unable.clone())?;
        let mut path = VARIANT::default();
        target.Get(w!("__PATH"), 0, &mut path, None, None).map_err(|_| unable.clone())?;
        let path_text = {
            let inner = &*path.Anonymous.Anonymous;
            if inner.vt != VT_BSTR {
                return Err(unable);
            }
            (*inner.Anonymous.bstrVal).clone()
        };
        let _ = VariantClear(&mut path);

        let mut class = None;
        wmi.GetObject(&BSTR::from("WmiMonitorBrightnessMethods"), WBEM_GENERIC_FLAG_TYPE(0), None, Some(&mut class), None).map_err(|_| unable.clone())?;
        let class: IWbemClassObject = class.ok_or(unable.clone())?;
        let mut signature = None;
        class.GetMethod(w!("WmiSetBrightness"), 0, &mut signature, std::ptr::null_mut()).map_err(|_| unable.clone())?;
        let arguments = signature.ok_or(unable.clone())?.SpawnInstance(0).map_err(|_| unable.clone())?;
        arguments.Put(w!("Timeout"), 0, &long_variant(1), 0).map_err(|_| unable.clone())?;
        arguments.Put(w!("Brightness"), 0, &level_variant(to_level(percent)), 0).map_err(|_| unable.clone())?;
        wmi.ExecMethod(&path_text, &BSTR::from("WmiSetBrightness"), WBEM_GENERIC_FLAG_TYPE(0), None, &arguments, None, None).map_err(|_| unable)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn brightness_is_clamped() {
        assert_eq!(to_level(150), 100);
        assert_eq!(to_level(55), 55);
        assert_eq!(to_level(0), 0);
    }
}
