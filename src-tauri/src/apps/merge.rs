//! Turns taskbar pins and open windows into one entry per app. Pure, so it's testable.

use serde::Serialize;

#[derive(Clone, Debug)]
pub struct Pin {
    pub name: String,
    pub link: String,
    pub target: Option<String>,
    pub app_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct RawWindow {
    pub hwnd: isize,
    pub title: String,
    pub exe: String,
    pub app_id: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct AppWindow {
    pub hwnd: isize,
    pub title: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct AppEntry {
    pub key: String,
    pub name: String,
    pub pinned: bool,
    pub active: bool,
    pub windows: Vec<AppWindow>,
    #[serde(skip)]
    pub launch: Option<String>,
    /// What to ask the shell for an icon: a shortcut, a program or a store app.
    #[serde(skip)]
    pub icon_source: Option<String>,
}

#[derive(PartialEq, Debug)]
pub enum Click {
    Launch,
    Focus(isize),
    Minimize(isize),
}

pub fn title_from_utf16(wide: &[u16]) -> String {
    String::from_utf16_lossy(wide)
}

pub fn keep_pin(pin: &Pin, exists: impl Fn(&str) -> bool) -> bool {
    match &pin.target {
        Some(target) => exists(target),
        None => pin.app_id.is_some(),
    }
}

fn same(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

fn exe_stem(exe: &str) -> &str {
    let file = exe.rsplit(['\\', '/']).next().unwrap_or(exe);
    file.rsplit_once('.').map_or(file, |(stem, _)| stem)
}

/// Store apps all run inside this host, so the program name says nothing about them.
fn is_frame_host(exe: &str) -> bool {
    same(exe_stem(exe), "ApplicationFrameHost")
}

pub fn merge(pins: &[Pin], windows: Vec<RawWindow>, foreground: isize) -> Vec<AppEntry> {
    let mut entries: Vec<AppEntry> = pins
        .iter()
        .map(|p| AppEntry {
            key: p.app_id.as_ref().or(p.target.as_ref()).unwrap_or(&p.link).to_lowercase(),
            name: p.name.clone(),
            pinned: true,
            active: false,
            windows: Vec::new(),
            launch: Some(p.link.clone()),
            icon_source: Some(p.link.clone()),
        })
        .collect();

    for w in windows {
        let pinned = pins.iter().position(|p| {
            p.app_id.as_ref().zip(w.app_id.as_ref()).is_some_and(|(a, b)| same(a, b))
                || p.target.as_ref().is_some_and(|t| same(t, &w.exe))
        });
        let key = w.app_id.as_ref().unwrap_or(&w.exe).to_lowercase();
        let index = pinned.or_else(|| entries.iter().position(|e| e.key == key));
        let index = index.unwrap_or_else(|| {
            let frame_host = is_frame_host(&w.exe);
            entries.push(AppEntry {
                key,
                name: if frame_host { w.title.clone() } else { exe_stem(&w.exe).to_string() },
                pinned: false,
                active: false,
                windows: Vec::new(),
                launch: Some(w.exe.clone()),
                icon_source: match (&w.app_id, frame_host) {
                    (Some(id), true) => Some(format!(r"shell:AppsFolder\{id}")),
                    _ => Some(w.exe.clone()),
                },
            });
            entries.len() - 1
        });
        let entry = &mut entries[index];
        entry.active |= w.hwnd == foreground;
        entry.windows.push(AppWindow { hwnd: w.hwnd, title: w.title });
    }
    entries
}

/// Focus it, minimize it if it's the active one, step through several, or launch.
pub fn click_plan(entry: &AppEntry, foreground: isize) -> Click {
    let handles: Vec<isize> = entry.windows.iter().map(|w| w.hwnd).collect();
    match handles.iter().position(|&h| h == foreground) {
        _ if handles.is_empty() => Click::Launch,
        None => Click::Focus(handles[0]),
        Some(_) if handles.len() == 1 => Click::Minimize(foreground),
        Some(i) => Click::Focus(handles[(i + 1) % handles.len()]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win(hwnd: isize, title: &str, exe: &str, app_id: Option<&str>) -> RawWindow {
        RawWindow { hwnd, title: title.into(), exe: exe.into(), app_id: app_id.map(String::from) }
    }

    fn pin(name: &str, target: Option<&str>, app_id: Option<&str>) -> Pin {
        Pin { name: name.into(), link: format!(r"C:\pins\{name}.lnk"), target: target.map(String::from), app_id: app_id.map(String::from) }
    }

    #[test]
    fn windows_of_one_app_merge_into_one_entry() {
        let list = merge(&[], vec![win(1, "a", r"C:\x\Code.exe", None), win(2, "b", r"c:\X\code.EXE", None)], 0);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].windows.len(), 2);
        assert_eq!(list[0].name, "Code");
    }

    #[test]
    fn separate_app_ids_stay_separate_even_from_one_exe() {
        let list = merge(&[], vec![win(1, "a", r"C:\h.exe", Some("App.One")), win(2, "b", r"C:\h.exe", Some("App.Two"))], 0);
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn pinned_store_app_merges_with_its_open_window_by_app_id() {
        let pins = [pin("Calc", None, Some("Microsoft.Calc!App"))];
        let list = merge(&pins, vec![win(5, "Calculator", r"C:\Windows\ApplicationFrameHost.exe", Some("microsoft.calc!app"))], 0);
        assert_eq!(list.len(), 1);
        assert!(list[0].pinned);
        assert_eq!(list[0].name, "Calc");
        assert_eq!(list[0].windows[0].hwnd, 5);
    }

    #[test]
    fn pinned_desktop_app_merges_with_its_window_by_exe_path() {
        let pins = [pin("Code", Some(r"C:\x\Code.exe"), None)];
        let list = merge(&pins, vec![win(5, "repo", r"c:\x\code.exe", Some("Some.Other.Id"))], 0);
        assert_eq!(list.len(), 1);
        assert!(list[0].pinned);
    }

    #[test]
    fn pins_come_first_then_open_apps() {
        let pins = [pin("Z", Some(r"C:\z.exe"), None)];
        let list = merge(&pins, vec![win(1, "a", r"C:\a.exe", None)], 0);
        assert_eq!(list.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(), ["Z", "a"]);
    }

    #[test]
    fn active_marks_the_entry_owning_the_foreground_window() {
        let list = merge(&[], vec![win(1, "a", r"C:\a.exe", None), win(2, "b", r"C:\b.exe", None)], 2);
        assert!(!list[0].active);
        assert!(list[1].active);
    }

    #[test]
    fn titles_with_cyrillic_and_emoji_survive() {
        let title = "Привет 🎉 мир";
        let wide: Vec<u16> = title.encode_utf16().collect();
        assert_eq!(title_from_utf16(&wide), title);
        let list = merge(&[], vec![win(1, title, r"C:\a.exe", None)], 0);
        assert_eq!(list[0].windows[0].title, title);
    }

    #[test]
    fn pin_with_missing_target_is_dropped() {
        let exists = |p: &str| p == r"C:\here.exe";
        assert!(keep_pin(&pin("a", Some(r"C:\here.exe"), None), exists));
        assert!(!keep_pin(&pin("b", Some(r"C:\gone.exe"), None), exists));
        assert!(keep_pin(&pin("store", None, Some("X!App")), exists), "store apps have no target path");
        assert!(!keep_pin(&pin("nothing", None, None), exists));
    }

    #[test]
    fn launch_uses_the_pin_when_there_is_one() {
        let pins = [pin("Calc", None, Some("Calc!App"))];
        let list = merge(&pins, vec![win(1, "a", r"C:\a.exe", None)], 0);
        assert_eq!(list[0].launch.as_deref(), Some(r"C:\pins\Calc.lnk"));
        assert_eq!(list[1].launch.as_deref(), Some(r"C:\a.exe"));
    }

    #[test]
    fn click_plan_focuses_minimizes_cycles_or_launches() {
        let mk = |windows: Vec<isize>, active: bool| AppEntry {
            key: "k".into(),
            name: "n".into(),
            pinned: false,
            active,
            launch: Some("x".into()),
            icon_source: None,
            windows: windows.into_iter().map(|hwnd| AppWindow { hwnd, title: String::new() }).collect(),
        };
        assert_eq!(click_plan(&mk(vec![], false), 0), Click::Launch);
        assert_eq!(click_plan(&mk(vec![7, 8], false), 0), Click::Focus(7));
        assert_eq!(click_plan(&mk(vec![7], true), 7), Click::Minimize(7));
        assert_eq!(click_plan(&mk(vec![7, 8], true), 7), Click::Focus(8));
        assert_eq!(click_plan(&mk(vec![7, 8], true), 8), Click::Focus(7));
    }
}
