//! The screens, each known by a name that survives unplugging it, and which one the dock sits on.

use serde::Serialize;

use super::dock::Rect;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Display {
    /// The monitor's device path: stable from one plugging to the next.
    pub id: String,
    pub name: String,
    pub primary: bool,
    #[serde(skip)]
    pub rect: Rect,
    #[serde(skip)]
    pub scale: f64,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum DisplayMode {
    Single,
    All,
    Follow,
}

impl DisplayMode {
    pub fn from_name(name: Option<&str>) -> DisplayMode {
        match name {
            Some("all") => DisplayMode::All,
            Some("follow") => DisplayMode::Follow,
            _ => DisplayMode::Single,
        }
    }
}

/// The wanted screen while it's plugged in, else the main one, else the first.
pub fn dock_display<'a>(displays: &'a [Display], wanted: Option<&str>) -> Option<&'a Display> {
    wanted
        .and_then(|id| displays.iter().find(|d| d.id == id))
        .or_else(|| displays.iter().find(|d| d.primary))
        .or_else(|| displays.first())
}

/// What the screen calls itself; a laptop's own panel often says nothing.
fn display_name(friendly: &str, internal: bool, index: usize) -> String {
    match friendly.trim() {
        "" if internal => "Built-in display".to_string(),
        "" => format!("Screen {index}"),
        name => name.to_string(),
    }
}

/// What DisplayConfig says about one screen, found by its GDI name (`\.\DISPLAY1`).
struct Target {
    gdi: String,
    path: String,
    friendly: String,
    internal: bool,
}

fn wide(text: &[u16]) -> String {
    let end = text.iter().position(|&c| c == 0).unwrap_or(text.len());
    String::from_utf16_lossy(&text[..end])
}

fn targets() -> Vec<Target> {
    use windows::Win32::Devices::Display::*;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    let mut out: Vec<Target> = Vec::new();
    unsafe {
        let (mut paths, mut modes) = (0u32, 0u32);
        if GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut paths, &mut modes) != ERROR_SUCCESS {
            return out;
        }
        let mut path_info = vec![DISPLAYCONFIG_PATH_INFO::default(); paths as usize];
        let mut mode_info = vec![DISPLAYCONFIG_MODE_INFO::default(); modes as usize];
        if QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &mut paths, path_info.as_mut_ptr(), &mut modes, mode_info.as_mut_ptr(), None) != ERROR_SUCCESS {
            return out;
        }
        path_info.truncate(paths as usize);
        for p in &path_info {
            let mut source = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
            source.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
            source.header.size = std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32;
            source.header.adapterId = p.sourceInfo.adapterId;
            source.header.id = p.sourceInfo.id;
            let mut target = DISPLAYCONFIG_TARGET_DEVICE_NAME::default();
            target.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
            target.header.size = std::mem::size_of::<DISPLAYCONFIG_TARGET_DEVICE_NAME>() as u32;
            target.header.adapterId = p.targetInfo.adapterId;
            target.header.id = p.targetInfo.id;
            if DisplayConfigGetDeviceInfo(&mut source.header) != 0 || DisplayConfigGetDeviceInfo(&mut target.header) != 0 {
                continue;
            }
            let gdi = wide(&source.viewGdiDeviceName);
            // Duplicated screens share one source: the first target stands for it.
            if out.iter().any(|t| t.gdi == gdi) {
                continue;
            }
            let tech = target.outputTechnology;
            out.push(Target {
                gdi,
                path: wide(&target.monitorDevicePath),
                friendly: wide(&target.monitorFriendlyDeviceName),
                internal: tech == DISPLAYCONFIG_OUTPUT_TECHNOLOGY_INTERNAL
                    || tech == DISPLAYCONFIG_OUTPUT_TECHNOLOGY_DISPLAYPORT_EMBEDDED
                    || tech == DISPLAYCONFIG_OUTPUT_TECHNOLOGY_LVDS,
            });
        }
    }
    out
}

pub fn list() -> Vec<Display> {
    use windows::core::BOOL;
    use windows::Win32::Foundation::{LPARAM, RECT};
    use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW};
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};

    unsafe extern "system" fn each(monitor: HMONITOR, _: HDC, _: *mut RECT, found: LPARAM) -> BOOL {
        (*(found.0 as *mut Vec<HMONITOR>)).push(monitor);
        true.into()
    }
    let mut monitors: Vec<HMONITOR> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(each), LPARAM(&mut monitors as *mut _ as isize));
    }
    let targets = targets();
    monitors
        .into_iter()
        .enumerate()
        .filter_map(|(i, monitor)| unsafe {
            let mut info = MONITORINFOEXW::default();
            info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            if !GetMonitorInfoW(monitor, &mut info as *mut _ as *mut MONITORINFO).as_bool() {
                return None;
            }
            let r = info.monitorInfo.rcMonitor;
            let (mut dpi, mut _y) = (96u32, 96u32);
            let _ = GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi, &mut _y);
            let gdi = wide(&info.szDevice);
            let target = targets.iter().find(|t| t.gdi == gdi);
            Some(Display {
                id: target.map_or_else(|| gdi.clone(), |t| t.path.clone()),
                name: display_name(target.map_or("", |t| t.friendly.as_str()), target.is_some_and(|t| t.internal), i + 1),
                primary: info.monitorInfo.dwFlags & 1 != 0,
                rect: Rect { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top },
                scale: dpi as f64 / 96.0,
            })
        })
        .collect()
}

#[tauri::command(async)]
pub fn displays_list() -> Vec<Display> {
    list()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn screen(id: &str, primary: bool) -> Display {
        Display { id: id.into(), name: id.into(), primary, rect: Rect { x: 0, y: 0, w: 1920, h: 1080 }, scale: 1.0 }
    }

    #[test]
    fn the_chosen_screen_is_used_when_plugged_in() {
        let all = [screen("main-id", true), screen("side-id", false)];
        assert_eq!(dock_display(&all, Some("side-id")).unwrap().id, "side-id");
    }

    #[test]
    fn an_unplugged_choice_waits_on_the_main_screen() {
        let all = [screen("main-id", true), screen("side-id", false)];
        assert!(dock_display(&all, Some("gone")).unwrap().primary);
    }

    #[test]
    fn no_choice_means_the_main_screen() {
        let all = [screen("side-id", false), screen("main-id", true)];
        assert!(dock_display(&all, None).unwrap().primary);
    }

    #[test]
    fn with_no_main_screen_reported_the_first_one_is_used() {
        let all = [screen("side-id", false)];
        assert_eq!(dock_display(&all, None).unwrap().id, "side-id");
    }

    #[test]
    fn no_screen_at_all_gives_nothing() {
        assert!(dock_display(&[], None).is_none());
    }

    #[test]
    fn unknown_display_modes_mean_one_screen() {
        assert_eq!(DisplayMode::from_name(Some("all")), DisplayMode::All);
        assert_eq!(DisplayMode::from_name(Some("follow")), DisplayMode::Follow);
        assert_eq!(DisplayMode::from_name(Some("x")), DisplayMode::Single);
        assert_eq!(DisplayMode::from_name(None), DisplayMode::Single);
    }

    #[test]
    fn a_laptop_screen_without_a_name_is_called_built_in() {
        assert_eq!(display_name("", true, 1), "Built-in display");
        assert_eq!(display_name("", false, 2), "Screen 2");
        assert_eq!(display_name("LG TV", false, 2), "LG TV");
    }
}
