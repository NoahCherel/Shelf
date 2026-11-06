//! The pages a browser visited last, for its right-click menu. Read from a copy of the browser's own
//! history, which is never written to, and kept nowhere.

use std::path::{Path, PathBuf};

use base64::Engine;
use rusqlite::{Connection, OpenFlags};

/// A page the browser visited.
#[derive(Clone, Debug, PartialEq)]
pub struct Visit {
    pub title: String,
    pub url: String,
    /// Its icon as a data URL, when the browser kept one.
    pub icon: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Browser {
    /// The profile folder Firefox uses by default.
    Firefox(PathBuf),
    /// The "User Data" folder of a Chromium browser: Edge, Chrome, Brave.
    Chromium(PathBuf),
}

/// Which browser a program is, and where it keeps its history.
pub fn browser_for(exe: &str) -> Option<Browser> {
    let name = exe.rsplit(['\\', '/']).next().unwrap_or(exe).to_lowercase();
    let local = || PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default());
    match name.as_str() {
        "firefox.exe" => {
            let mozilla = PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join(r"Mozilla\Firefox");
            let installs = std::fs::read_to_string(mozilla.join("installs.ini")).unwrap_or_default();
            let profiles = std::fs::read_to_string(mozilla.join("profiles.ini")).unwrap_or_default();
            firefox_profile(&installs, &profiles).map(|relative| Browser::Firefox(mozilla.join(relative)))
        }
        "msedge.exe" => Some(Browser::Chromium(local().join(r"Microsoft\Edge\User Data"))),
        "chrome.exe" => Some(Browser::Chromium(local().join(r"Google\Chrome\User Data"))),
        "brave.exe" => Some(Browser::Chromium(local().join(r"BraveSoftware\Brave-Browser\User Data"))),
        _ => None,
    }
}

/// Firefox's default profile, relative to its folder: the one an install uses, else the one marked
/// as default.
pub fn firefox_profile(installs: &str, profiles: &str) -> Option<String> {
    let value = |line: &str, key: &str| line.trim().strip_prefix(key).map(|v| v.trim().replace('/', "\\"));
    if let Some(found) = installs.lines().find_map(|l| value(l, "Default=")) {
        return Some(found);
    }
    let mut path = None;
    for line in profiles.lines().chain(["[end]"]) {
        if line.trim().starts_with('[') {
            path = None;
        }
        if let Some(p) = value(line, "Path=") {
            path = Some(p);
        }
        if line.trim() == "Default=1" {
            if let Some(p) = &path {
                return Some(p.clone());
            }
        }
    }
    None
}

/// The browser's last visited pages, newest first, at most `most`.
pub fn recent(browser: &Browser, most: usize) -> Vec<Visit> {
    match browser {
        Browser::Firefox(profile) => read_copy(&profile.join("places.sqlite"), |db| firefox_visits(db, most))
            .map(|visits| with_icons(visits, &profile.join("favicons.sqlite"), FIREFOX_ICON))
            .unwrap_or_default(),
        Browser::Chromium(data) => {
            let profile = data.join("Default");
            read_copy(&profile.join("History"), |db| chromium_visits(db, most))
                .map(|visits| with_icons(visits, &profile.join("Favicons"), CHROMIUM_ICON))
                .unwrap_or_default()
        }
    }
}

const FIREFOX_ICON: &str = "SELECT i.data FROM moz_pages_w_icons p JOIN moz_icons_to_pages ip ON ip.page_id = p.id \
     JOIN moz_icons i ON i.id = ip.icon_id WHERE p.page_url = ?1 ORDER BY ABS(i.width - 32) LIMIT 1";
const CHROMIUM_ICON: &str = "SELECT b.image_data FROM icon_mapping m JOIN favicon_bitmaps b ON b.icon_id = m.icon_id \
     WHERE m.page_url = ?1 ORDER BY ABS(b.width - 32) LIMIT 1";

/// Pages Firefox visited, once each, by their latest visit. Hidden pages, such as redirects, and
/// anything that isn't a web page are left out.
pub fn firefox_visits(db: &Connection, most: usize) -> rusqlite::Result<Vec<Visit>> {
    let mut query = db.prepare(
        "SELECT p.url, COALESCE(NULLIF(p.title, ''), p.url), MAX(v.visit_date) AS last FROM moz_historyvisits v \
         JOIN moz_places p ON p.id = v.place_id WHERE p.hidden = 0 AND (p.url LIKE 'http://%' OR p.url LIKE 'https://%') \
         GROUP BY p.id ORDER BY last DESC LIMIT ?1",
    )?;
    let rows = query.query_map([most as i64], |r| Ok(Visit { url: r.get(0)?, title: r.get(1)?, icon: None }))?;
    rows.collect()
}

/// Pages a Chromium browser visited, by their latest visit.
pub fn chromium_visits(db: &Connection, most: usize) -> rusqlite::Result<Vec<Visit>> {
    let mut query = db.prepare(
        "SELECT url, COALESCE(NULLIF(title, ''), url) FROM urls WHERE hidden = 0 AND (url LIKE 'http://%' OR url LIKE 'https://%') \
         ORDER BY last_visit_time DESC LIMIT ?1",
    )?;
    let rows = query.query_map([most as i64], |r| Ok(Visit { url: r.get(0)?, title: r.get(1)?, icon: None }))?;
    rows.collect()
}

/// What kind of picture an icon is, from its first bytes.
pub fn data_url(bytes: &[u8]) -> Option<String> {
    let mime = match bytes {
        [0x89, b'P', b'N', b'G', ..] => "image/png",
        [0, 0, 1, 0, ..] => "image/x-icon",
        [0xFF, 0xD8, ..] => "image/jpeg",
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => "image/webp",
        _ if bytes.trim_ascii_start().starts_with(b"<") => "image/svg+xml",
        _ => return None,
    };
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

fn with_icons(mut visits: Vec<Visit>, icons: &Path, query: &str) -> Vec<Visit> {
    let _ = read_copy(icons, |db| {
        let mut find = db.prepare(query)?;
        for visit in &mut visits {
            let found: Option<Vec<u8>> = find.query_row([&visit.url], |r| r.get(0)).ok();
            visit.icon = found.as_deref().and_then(data_url);
        }
        Ok(())
    });
    visits
}

/// Runs `read` on a copy of a database the browser keeps open, with its write-ahead log so the
/// latest visits are there, then removes the copy.
fn read_copy<T>(db: &Path, read: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Option<T> {
    let name = db.file_name()?.to_string_lossy().into_owned();
    let folder = std::env::temp_dir().join(format!("shelf-history-{}", std::process::id()));
    std::fs::create_dir_all(&folder).ok()?;
    let copy = folder.join(&name);
    let result = (|| {
        std::fs::copy(db, &copy).ok()?;
        let wal = db.with_file_name(format!("{name}-wal"));
        if wal.exists() {
            let _ = std::fs::copy(&wal, folder.join(format!("{name}-wal")));
        }
        let connection = Connection::open_with_flags(&copy, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX).ok()?;
        read(&connection).ok()
    })();
    let _ = std::fs::remove_dir_all(&folder);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn firefox_db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT, hidden INTEGER DEFAULT 0);
             CREATE TABLE moz_historyvisits (id INTEGER PRIMARY KEY, place_id INTEGER, visit_date INTEGER);
             INSERT INTO moz_places VALUES (1, 'https://old.example/', 'Old', 0), (2, 'https://new.example/', 'New', 0),
               (3, 'https://hidden.example/', 'Redirect', 1), (4, 'place:sort=8', 'A query', 0), (5, 'https://untitled.example/', '', 0);
             INSERT INTO moz_historyvisits (place_id, visit_date) VALUES (1, 100), (2, 300), (1, 150), (3, 400), (4, 500), (5, 200);",
        )
        .unwrap();
        db
    }

    #[test]
    fn firefox_s_last_pages_come_newest_first_once_each_without_hidden_ones() {
        let visits = firefox_visits(&firefox_db(), 8).unwrap();
        assert_eq!(visits.iter().map(|v| v.url.as_str()).collect::<Vec<_>>(), ["https://new.example/", "https://untitled.example/", "https://old.example/"]);
        assert_eq!(visits[1].title, "https://untitled.example/", "a page with no title shows its address");
        assert_eq!(firefox_visits(&firefox_db(), 1).unwrap().len(), 1);
    }

    #[test]
    fn a_chromium_browser_s_last_pages_come_newest_first() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, last_visit_time INTEGER, hidden INTEGER DEFAULT 0);
             INSERT INTO urls (url, title, last_visit_time, hidden) VALUES ('https://a.example/', 'A', 10, 0), ('https://b.example/', 'B', 30, 0),
               ('https://c.example/', 'C', 50, 1), ('chrome://settings/', 'Settings', 60, 0);",
        )
        .unwrap();
        let visits = chromium_visits(&db, 8).unwrap();
        assert_eq!(visits.iter().map(|v| v.title.as_str()).collect::<Vec<_>>(), ["B", "A"]);
    }

    #[test]
    fn firefox_s_default_profile_is_found() {
        assert_eq!(firefox_profile("[308046B0AF4A39CB]\nDefault=Profiles/abc.default-release\nLocked=1\n", ""), Some(r"Profiles\abc.default-release".into()));
        let profiles = "[Profile1]\nName=old\nPath=Profiles/old\n\n[Profile0]\nName=main\nIsRelative=1\nPath=Profiles/main\nDefault=1\n";
        assert_eq!(firefox_profile("", profiles), Some(r"Profiles\main".into()));
        assert_eq!(firefox_profile("", ""), None);
    }

    #[test]
    fn browsers_are_known_by_their_program() {
        assert!(matches!(browser_for(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"), Some(Browser::Chromium(_))));
        assert_eq!(browser_for(r"C:\Discord\Discord.exe"), None);
    }

    #[test]
    fn an_icon_s_kind_is_told_by_its_first_bytes() {
        assert!(data_url(&[0x89, b'P', b'N', b'G', 1, 2]).unwrap().starts_with("data:image/png;base64,"));
        assert!(data_url(&[0, 0, 1, 0, 1]).unwrap().starts_with("data:image/x-icon;"));
        assert!(data_url(b"  <svg/>").unwrap().starts_with("data:image/svg+xml;"));
        assert_eq!(data_url(b"nope"), None);
    }
}
