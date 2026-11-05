//! The Notifications card: what Windows is holding, read when asked. Nothing here is stored, logged
//! or kept between calls.

use serde::Serialize;
use windows::core::{w, HSTRING, PCWSTR};
use windows::UI::Notifications::Management::{UserNotificationListener, UserNotificationListenerAccessStatus};
use windows::UI::Notifications::{KnownNotificationBindings, NotificationKinds, UserNotification};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

/// Windows' time starts in 1601, in steps of 100 ns.
const TICKS_TO_1970: i64 = 116_444_736_000_000_000;
const TICKS_PER_MS: i64 = 10_000;

#[derive(Serialize, Debug)]
pub struct Row {
    id: u32,
    app: String,
    title: String,
    body: String,
    at: i64,
}

#[derive(Serialize)]
pub struct NotificationList {
    access: bool,
    items: Vec<Row>,
}

fn to_unix_ms(ticks: i64) -> i64 {
    ((ticks - TICKS_TO_1970) / TICKS_PER_MS).max(0)
}

fn to_row(id: u32, app: &str, texts: Vec<String>, at: i64) -> Row {
    let mut lines = texts.into_iter();
    Row { id, app: app.to_string(), title: lines.next().unwrap_or_else(|| app.to_string()), body: lines.collect::<Vec<_>>().join("\n"), at }
}

fn newest_first(rows: &mut [Row]) {
    rows.sort_by_key(|r| std::cmp::Reverse(r.at));
}

fn all() -> windows::core::Result<Vec<UserNotification>> {
    Ok(UserNotificationListener::Current()?.GetNotificationsAsync(NotificationKinds::Toast)?.get()?.into_iter().collect())
}

fn read(notification: &UserNotification) -> windows::core::Result<Row> {
    let app = notification.AppInfo()?.DisplayInfo()?.DisplayName()?.to_string();
    let binding = notification.Notification()?.Visual()?.GetBinding(&KnownNotificationBindings::ToastGeneric()?)?;
    let texts = binding.GetTextElements()?.into_iter().filter_map(|t| t.Text().ok()).map(|t| t.to_string()).collect();
    Ok(to_row(notification.Id()?, &app, texts, to_unix_ms(notification.CreationTime()?.UniversalTime)))
}

fn allowed() -> bool {
    UserNotificationListener::Current().and_then(|l| l.GetAccessStatus()).is_ok_and(|s| s == UserNotificationListenerAccessStatus::Allowed)
}

/// How many are waiting, for the bell.
pub fn count() -> u32 {
    if !allowed() {
        return 0;
    }
    all().map_or(0, |list| list.len() as u32)
}

#[tauri::command(async)]
pub fn notifications_list() -> NotificationList {
    if !allowed() {
        return NotificationList { access: false, items: Vec::new() };
    }
    let mut items: Vec<Row> = all().unwrap_or_default().iter().filter_map(|n| read(n).ok()).collect();
    newest_first(&mut items);
    NotificationList { access: true, items }
}

#[tauri::command(async)]
pub fn notification_dismiss(id: u32) -> Result<(), String> {
    crate::preview::guard()?;
    UserNotificationListener::Current().and_then(|l| l.RemoveNotification(id)).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn notifications_clear() -> Result<(), String> {
    crate::preview::guard()?;
    UserNotificationListener::Current().and_then(|l| l.ClearNotifications()).map_err(|e| e.to_string())
}

struct AppMatch {
    key: String,
    name: String,
    hwnd: Option<isize>,
}

const SHORTEST_NAME_MATCH: usize = 3;

/// A notification names its app differently from the app's window, so the id is tried first, then
/// the name, which can be longer or shorter on either side, as "Mozilla Firefox" and "Firefox".
fn window_for(apps: &[AppMatch], app_id: &str, name: &str) -> Option<isize> {
    let open = || apps.iter().filter(|a| a.hwnd.is_some());
    let wanted = name.to_lowercase();
    let similar = |a: &&AppMatch| {
        let theirs = a.name.to_lowercase();
        theirs == wanted
            || (theirs.len() >= SHORTEST_NAME_MATCH && wanted.len() >= SHORTEST_NAME_MATCH && (theirs.contains(&wanted) || wanted.contains(&theirs)))
    };
    open().find(|a| a.key.eq_ignore_ascii_case(app_id)).or_else(|| open().find(similar)).and_then(|a| a.hwnd)
}

/// Windows lets no one else press a notification, so its exact message can't be reached. This goes
/// to its app: the window if it's open, or starting it if not, and clears the notification.
#[tauri::command(async)]
pub fn notification_open(id: u32) -> Result<(), String> {
    crate::preview::guard()?;
    let found = all().map_err(|e| e.to_string())?.into_iter().find(|n| n.Id().is_ok_and(|i| i == id)).ok_or("This notification has gone.")?;
    let info = found.AppInfo().map_err(|e| e.to_string())?;
    let app_id = info.AppUserModelId().map_or(String::new(), |a| a.to_string());
    let name = info.DisplayInfo().and_then(|d| d.DisplayName()).map_or(String::new(), |n| n.to_string());
    let apps: Vec<AppMatch> = crate::apps::current()?
        .into_iter()
        .map(|e| AppMatch { hwnd: e.windows.first().map(|w| w.hwnd), key: e.key, name: e.name })
        .collect();
    match window_for(&apps, &app_id, &name) {
        Some(window) => crate::apps::bring_forward(window),
        None => {
            let started = unsafe { ShellExecuteW(None, w!("open"), &HSTRING::from(format!(r"shell:AppsFolder\{app_id}")), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
            // Below this number, it's an error rather than something started.
            if (started.0 as isize) <= 32 {
                return Err("Windows has no way to open this one.".into());
            }
        }
    }
    notification_dismiss(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_line_is_the_title_and_the_rest_the_body() {
        let row = to_row(7, "Discord", vec!["Alex".into(), "See you".into(), "tonight".into()], 0);
        assert_eq!(row.title, "Alex");
        assert_eq!(row.body, "See you\ntonight");
    }

    #[test]
    fn no_text_at_all_uses_the_apps_name() {
        let row = to_row(7, "Discord", vec![], 0);
        assert_eq!(row.title, "Discord");
        assert_eq!(row.body, "");
    }

    #[test]
    fn windows_time_becomes_milliseconds_since_1970() {
        // 100 ns units since 1601.
        assert_eq!(to_unix_ms(116_444_736_000_000_000), 0);
        assert_eq!(to_unix_ms(116_444_736_000_000_000 + 10_000), 1);
        assert_eq!(to_unix_ms(0), 0, "never before 1970");
    }

    fn open(key: &str, name: &str) -> AppMatch {
        AppMatch { key: key.into(), name: name.into(), hwnd: Some(5) }
    }

    #[test]
    fn its_window_is_found_by_the_apps_id() {
        let apps = vec![open("308046b0af4a39cb", "Firefox")];
        assert_eq!(window_for(&apps, "308046B0AF4A39CB", "Something else"), Some(5));
    }

    #[test]
    fn its_window_is_found_by_name_when_the_ids_differ() {
        let apps = vec![open(r"c:\apps\discord.exe", "Discord")];
        assert_eq!(window_for(&apps, "com.squirrel.Discord.Discord", "Discord"), Some(5));
    }

    #[test]
    fn a_longer_or_shorter_name_still_matches() {
        assert_eq!(window_for(&[open("a", "Firefox")], "x", "Mozilla Firefox"), Some(5));
        assert_eq!(window_for(&[open("a", "OUTLOOK")], "x", "Outlook"), Some(5));
        assert_eq!(window_for(&[open("a", "Microsoft Teams")], "x", "Teams"), Some(5));
    }

    #[test]
    fn a_very_short_name_doesnt_match_by_accident() {
        assert_eq!(window_for(&[open("a", "Go")], "x", "Google Chrome"), None);
    }

    #[test]
    fn an_app_with_no_window_isnt_a_match() {
        let closed = AppMatch { key: "a".into(), name: "Discord".into(), hwnd: None };
        assert_eq!(window_for(&[closed], "a", "Discord"), None);
    }

    #[test]
    fn the_exact_id_wins_over_a_similar_name() {
        let apps = vec![AppMatch { key: "b".into(), name: "Discord".into(), hwnd: Some(1) }, AppMatch { key: "a".into(), name: "Other".into(), hwnd: Some(2) }];
        assert_eq!(window_for(&apps, "a", "Discord"), Some(2));
    }

    #[test]
    fn newest_comes_first() {
        let mut rows = vec![to_row(1, "A", vec![], 100), to_row(2, "B", vec![], 300), to_row(3, "C", vec![], 200)];
        newest_first(&mut rows);
        assert_eq!(rows.iter().map(|r| r.id).collect::<Vec<_>>(), [2, 3, 1]);
    }
}
