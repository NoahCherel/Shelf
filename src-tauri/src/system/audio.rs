//! The Sound card's data and controls: the speaker's volume, each app's volume, and the outputs.

use std::ffi::c_void;

use serde::Serialize;
use windows::core::{interface, Interface, GUID, HRESULT, HSTRING, IUnknown, IUnknown_Vtbl, PCWSTR};
use windows::Win32::Foundation::PROPERTYKEY;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{
    eCommunications, eConsole, eMultimedia, eRender, AudioSessionStateExpired, IAudioSessionControl2,
    IAudioSessionManager2, IMMDevice, IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator,
    DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;

use crate::apps::{exe_of_pid, icon_of_exe, store_string};

const FRIENDLY_NAME: PROPERTYKEY = PROPERTYKEY { fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0), pid: 14 };

#[derive(Serialize)]
pub struct AudioDevice {
    id: String,
    name: String,
    active: bool,
}

#[derive(Serialize)]
pub struct AudioApp {
    pid: u32,
    name: String,
    exe: String,
    volume: u32,
    muted: bool,
}

#[derive(Serialize)]
pub struct AudioState {
    volume: u32,
    muted: bool,
    device: Option<String>,
    devices: Vec<AudioDevice>,
    apps: Vec<AudioApp>,
}

struct RawSession {
    pid: u32,
    name: String,
    exe: String,
    volume: u32,
    muted: bool,
    expired: bool,
}

fn to_scalar(percent: u32) -> f32 {
    percent.min(100) as f32 / 100.0
}

fn session_name(raw: &RawSession) -> String {
    // Windows sometimes hands over a reference to a resource instead of a name.
    if !raw.name.is_empty() && !raw.name.starts_with('@') {
        return raw.name.clone();
    }
    match crate::util::file_stem(&raw.exe) {
        "" if raw.pid == 0 => "System sounds".to_string(),
        "" => "Unknown app".to_string(),
        name => name.to_string(),
    }
}

/// One row per process, leaving out sessions that have ended.
fn merge_sessions(raw: Vec<RawSession>) -> Vec<AudioApp> {
    let mut apps: Vec<AudioApp> = Vec::new();
    for session in raw.iter().filter(|s| !s.expired) {
        if apps.iter().any(|a| a.pid == session.pid) {
            continue;
        }
        apps.push(AudioApp {
            pid: session.pid,
            name: session_name(session),
            exe: session.exe.clone(),
            volume: session.volume,
            muted: session.muted,
        });
    }
    apps
}

unsafe fn devices() -> windows::core::Result<IMMDeviceEnumerator> {
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
}

unsafe fn device_id(device: &IMMDevice) -> Option<String> {
    let raw = device.GetId().ok()?;
    let id = raw.to_string().ok();
    CoTaskMemFree(Some(raw.as_ptr() as *const c_void));
    id
}

unsafe fn device_name(device: &IMMDevice) -> Option<String> {
    let store: IPropertyStore = device.OpenPropertyStore(STGM_READ).ok()?;
    store_string(&store, &FRIENDLY_NAME)
}

unsafe fn sessions(speaker: &IMMDevice) -> Vec<RawSession> {
    let Ok(manager) = speaker.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else { return Vec::new() };
    let Ok(list) = manager.GetSessionEnumerator() else { return Vec::new() };
    let mut out = Vec::new();
    for i in 0..list.GetCount().unwrap_or(0) {
        let Ok(control) = list.GetSession(i) else { continue };
        let Ok(detail) = control.cast::<IAudioSessionControl2>() else { continue };
        let Ok(volume) = control.cast::<ISimpleAudioVolume>() else { continue };
        let pid = detail.GetProcessId().unwrap_or(0);
        let name = control.GetDisplayName().map(|p| {
            let text = p.to_string().unwrap_or_default();
            CoTaskMemFree(Some(p.as_ptr() as *const c_void));
            text
        });
        out.push(RawSession {
            pid,
            name: name.unwrap_or_default(),
            exe: if pid == 0 { String::new() } else { exe_of_pid(pid) },
            volume: crate::system::percent(volume.GetMasterVolume().unwrap_or(0.0)),
            muted: volume.GetMute().is_ok_and(|m| m.as_bool()),
            expired: control.GetState().is_ok_and(|s| s == AudioSessionStateExpired),
        });
    }
    out
}

fn no_device() -> AudioState {
    AudioState { volume: 0, muted: false, device: None, devices: Vec::new(), apps: Vec::new() }
}

/// No device isn't an error, just something the card has to say.
#[tauri::command(async)]
pub fn audio_state() -> AudioState {
    unsafe {
        let Ok(enumerator) = devices() else { return no_device() };
        let Ok(speaker) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) else { return no_device() };
        let current = device_id(&speaker);
        let mut list = Vec::new();
        if let Ok(all) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) {
            for i in 0..all.GetCount().unwrap_or(0) {
                let Ok(device) = all.Item(i) else { continue };
                let Some(id) = device_id(&device) else { continue };
                list.push(AudioDevice {
                    active: Some(&id) == current.as_ref(),
                    name: device_name(&device).unwrap_or_else(|| "Sound device".to_string()),
                    id,
                });
            }
        }
        let endpoint = speaker.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).ok();
        AudioState {
            volume: endpoint.as_ref().and_then(|v| v.GetMasterVolumeLevelScalar().ok()).map_or(0, crate::system::percent),
            muted: endpoint.as_ref().and_then(|v| v.GetMute().ok()).is_some_and(|m| m.as_bool()),
            device: device_name(&speaker),
            devices: list,
            apps: merge_sessions(sessions(&speaker)),
        }
    }
}

unsafe fn speaker_volume() -> Result<IAudioEndpointVolume, String> {
    let speaker = devices()
        .and_then(|d| d.GetDefaultAudioEndpoint(eRender, eMultimedia))
        .map_err(|e| e.to_string())?;
    speaker.Activate(CLSCTX_ALL, None).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn audio_set_volume(percent: u32) -> Result<(), String> {
    crate::preview::guard()?;
    unsafe {
        let volume = speaker_volume()?;
        volume.SetMasterVolumeLevelScalar(to_scalar(percent), std::ptr::null()).map_err(|e| e.to_string())
    }
}

#[tauri::command(async)]
pub fn audio_set_mute(muted: bool) -> Result<(), String> {
    crate::preview::guard()?;
    unsafe {
        let volume = speaker_volume()?;
        volume.SetMute(muted, std::ptr::null()).map_err(|e| e.to_string())
    }
}

#[tauri::command(async)]
pub fn audio_set_app_volume(pid: u32, percent: u32) -> Result<(), String> {
    crate::preview::guard()?;
    unsafe {
        let speaker = devices()
            .and_then(|d| d.GetDefaultAudioEndpoint(eRender, eMultimedia))
            .map_err(|e| e.to_string())?;
        let manager: IAudioSessionManager2 = speaker.Activate(CLSCTX_ALL, None).map_err(|e| e.to_string())?;
        let list = manager.GetSessionEnumerator().map_err(|e| e.to_string())?;
        for i in 0..list.GetCount().unwrap_or(0) {
            let Ok(control) = list.GetSession(i) else { continue };
            let Ok(detail) = control.cast::<IAudioSessionControl2>() else { continue };
            if detail.GetProcessId().unwrap_or(0) != pid {
                continue;
            }
            if let Ok(volume) = control.cast::<ISimpleAudioVolume>() {
                let _ = volume.SetMasterVolume(to_scalar(percent), std::ptr::null());
            }
        }
        Ok(())
    }
}

/// Windows has no public way to change the default output. This undocumented interface is what
/// every tool that does it uses. Only its slot in the table matters for the methods not called.
#[interface("f8679f50-850a-41cf-9c72-430f290290c8")]
unsafe trait IPolicyConfig: IUnknown {
    fn get_mix_format(&self) -> HRESULT;
    fn get_device_format(&self) -> HRESULT;
    fn reset_device_format(&self) -> HRESULT;
    fn set_device_format(&self) -> HRESULT;
    fn get_processing_period(&self) -> HRESULT;
    fn set_processing_period(&self) -> HRESULT;
    fn get_share_mode(&self) -> HRESULT;
    fn set_share_mode(&self) -> HRESULT;
    fn get_property_value(&self) -> HRESULT;
    fn set_property_value(&self) -> HRESULT;
    fn set_default_endpoint(&self, device: PCWSTR, role: i32) -> HRESULT;
}

const POLICY_CONFIG_CLIENT: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

#[tauri::command(async)]
pub fn audio_set_output(id: String) -> Result<(), String> {
    crate::preview::guard()?;
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let policy: IPolicyConfig = CoCreateInstance(&POLICY_CONFIG_CLIENT, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
        let device = HSTRING::from(id);
        for role in [eConsole, eMultimedia, eCommunications] {
            policy.set_default_endpoint(PCWSTR(device.as_ptr()), role.0).ok().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

/// An app's icon, for its row. Cached by program, so it costs nothing after the first ask.
#[tauri::command(async)]
pub fn audio_app_icon(exe: String) -> Result<Option<String>, String> {
    if exe.is_empty() {
        return Ok(None);
    }
    icon_of_exe(exe)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(pid: u32, name: &str, volume: u32, expired: bool) -> RawSession {
        RawSession { pid, name: name.into(), exe: format!(r"C:\apps\Program{pid}.exe"), volume, muted: false, expired }
    }

    #[test]
    fn percent_is_clamped_both_ways() {
        assert_eq!(to_scalar(150), 1.0);
        assert_eq!(to_scalar(0), 0.0);
        assert_eq!(crate::system::percent(1.5), 100);
        assert_eq!(crate::system::percent(-1.0), 0);
        assert_eq!(crate::system::percent(0.404), 40);
    }

    #[test]
    fn sessions_of_one_process_merge() {
        let apps = merge_sessions(vec![session(7, "Firefox", 80, false), session(7, "Firefox", 20, false), session(9, "Zoom", 50, false)]);
        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0].pid, 7);
        assert_eq!(apps[0].volume, 80);
    }

    #[test]
    fn a_session_with_no_name_uses_its_program_name() {
        let apps = merge_sessions(vec![session(7, "", 80, false)]);
        assert_eq!(apps[0].name, "Program7");
    }

    #[test]
    fn a_resource_string_is_not_a_name() {
        let apps = merge_sessions(vec![session(7, "@%SystemRoot%\\System32\\AudioSrv.Dll,-202", 80, false)]);
        assert_eq!(apps[0].name, "Program7");
    }

    #[test]
    fn a_program_windows_wont_name_is_not_called_system_sounds() {
        let mut raw = session(7, "", 60, false);
        raw.exe = String::new();
        assert_eq!(merge_sessions(vec![raw])[0].name, "Unknown app");
    }

    #[test]
    fn the_system_session_has_a_plain_name() {
        let mut raw = session(0, "", 60, false);
        raw.exe = String::new();
        assert_eq!(merge_sessions(vec![raw])[0].name, "System sounds");
    }

    #[test]
    fn expired_sessions_are_left_out() {
        assert!(merge_sessions(vec![session(7, "Gone", 80, true)]).is_empty());
    }
}
