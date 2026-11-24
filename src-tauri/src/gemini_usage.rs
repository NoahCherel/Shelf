//! Antigravity (Gemini) quota usage via the official `agy` CLI.
//!
//! Runs `agy -p "/usage" --output-format json` (0 turns, 0 tokens) and caches
//! the 5-hour session and 7-day weekly quotas in `%APPDATA%\Shelf\gemini_usage.json`.
//! Never reads OAuth credential files or probes local ports.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

use crate::claude_usage::parse_iso_epoch_secs;

const MAX_HISTORY: usize = 24;
const CACHE_TTL_MS: u64 = 120_000;
const AGY_TIMEOUT: Duration = Duration::from_secs(20);
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

static LAST_ATTEMPT_MS: OnceLock<Mutex<u64>> = OnceLock::new();
static FETCH_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn last_attempt_ms() -> &'static Mutex<u64> {
    LAST_ATTEMPT_MS.get_or_init(|| Mutex::new(0))
}

fn fetch_lock() -> &'static Mutex<()> {
    FETCH_LOCK.get_or_init(|| Mutex::new(()))
}

fn shelf_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    Path::new(&base).join("Shelf")
}

fn cache_file() -> PathBuf {
    shelf_dir().join("gemini_usage.json")
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn find_agy_exe() -> Option<PathBuf> {
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            for name in ["agy.exe", "agy.cmd", "agy.bat", "agy"] {
                let candidate = dir.join(name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let p = Path::new(&local).join("agy").join("bin").join("agy.exe");
        if p.is_file() {
            return Some(p);
        }
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        let p = Path::new(&home).join(".local").join("bin").join("agy.exe");
        if p.is_file() {
            return Some(p);
        }
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        let p = Path::new(&appdata).join("npm").join("agy.cmd");
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

#[derive(Debug, Clone, PartialEq)]
struct ParsedWindow {
    used_percentage: f64,
    resets_at: f64,
}

#[derive(Debug, Clone, PartialEq)]
struct ParsedGroup {
    name: String,
    session: Option<ParsedWindow>,
    weekly: Option<ParsedWindow>,
}

#[derive(Debug, Clone, PartialEq)]
struct ParsedAgyUsage {
    session: Option<ParsedWindow>,
    weekly: Option<ParsedWindow>,
    groups: Vec<ParsedGroup>,
}

fn extract_json_object(stdout: &str) -> Option<Value> {
    let trimmed = stdout.trim();
    if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
        if v.is_object() {
            return Some(v);
        }
    }
    for line in trimmed.lines().rev() {
        let l = line.trim();
        if l.starts_with('{') {
            if let Ok(v) = serde_json::from_str::<Value>(l) {
                if v.is_object() {
                    return Some(v);
                }
            }
        }
    }
    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    serde_json::from_str::<Value>(&trimmed[start..=end]).ok()
}

fn parse_bucket(bucket: &Value) -> Option<ParsedWindow> {
    let remaining = bucket.get("remaining_fraction")?.as_f64()?;
    let used = ((1.0 - remaining) * 100.0).clamp(0.0, 100.0);
    let resets_at = bucket
        .get("reset_time")
        .and_then(Value::as_str)
        .and_then(parse_iso_epoch_secs)
        .map(|s| s as f64)
        .or_else(|| {
            let secs = bucket.get("reset_in_seconds")?.as_u64()?;
            Some((now_ms() / 1000 + secs) as f64)
        })
        .unwrap_or(0.0);
    Some(ParsedWindow {
        used_percentage: used,
        resets_at,
    })
}

fn parse_agy_usage(stdout: &str) -> Option<ParsedAgyUsage> {
    let root = extract_json_object(stdout)?;
    let groups_val = root
        .pointer("/command/data/groups")
        .or_else(|| root.pointer("/structured_output/groups"))
        .or_else(|| root.pointer("/data/groups"))
        .and_then(Value::as_array)?;

    let mut groups = Vec::new();
    for g in groups_val {
        let name = g
            .get("name")
            .or_else(|| g.get("pool"))
            .and_then(Value::as_str)
            .unwrap_or("Antigravity")
            .to_string();
        let Some(buckets) = g.get("buckets").and_then(Value::as_array) else {
            continue;
        };
        let mut session = None;
        let mut weekly = None;
        for b in buckets {
            let win_tag = b
                .get("window")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase();
            let id_tag = b
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase();
            if win_tag == "5h" || id_tag.ends_with("-5h") {
                session = parse_bucket(b);
            } else if win_tag == "weekly" || win_tag == "7d" || id_tag.ends_with("-weekly") {
                weekly = parse_bucket(b);
            }
        }
        if session.is_some() || weekly.is_some() {
            groups.push(ParsedGroup { name, session, weekly });
        }
    }

    if groups.is_empty() {
        return None;
    }

    let primary = groups
        .iter()
        .find(|g| g.name.to_ascii_lowercase().contains("gemini"))
        .unwrap_or(&groups[0]);

    Some(ParsedAgyUsage {
        session: primary.session.clone(),
        weekly: primary.weekly.clone(),
        groups,
    })
}

fn run_agy_usage(exe: &Path) -> Option<ParsedAgyUsage> {
    let mut cmd = Command::new(exe);
    cmd.args(["-p", "/usage", "--output-format", "json"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().ok()?;
    let mut stdout_pipe = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = stdout_pipe.read_to_string(&mut buf);
        buf
    });

    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let output = reader.join().unwrap_or_default();
                if !status.success() {
                    return None;
                }
                return parse_agy_usage(&output);
            }
            Ok(None) => {
                if start.elapsed() >= AGY_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

fn window_json(w: &ParsedWindow) -> Value {
    json!({
        "used_percentage": w.used_percentage,
        "resets_at": w.resets_at,
    })
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("shelf-tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(tmp, path)
}

fn append_history(mut history: Vec<f64>, pct: f64) -> Vec<f64> {
    let clamped = pct.clamp(0.0, 100.0);
    let same = history
        .last()
        .is_some_and(|last| (*last - clamped).abs() < 0.05);
    if !same {
        history.push(clamped);
        if history.len() > MAX_HISTORY {
            let drop = history.len() - MAX_HISTORY;
            history.drain(0..drop);
        }
    }
    history
}

fn is_valid_antigravity_cache(val: &Value) -> bool {
    let Some(usage) = val.get("usage") else {
        return false;
    };
    usage.get("session").is_some_and(|v| !v.is_null())
        || usage.get("weekly").is_some_and(|v| !v.is_null())
}

fn load_valid_cache() -> Option<Value> {
    let text = std::fs::read_to_string(cache_file()).ok()?;
    let val = serde_json::from_str::<Value>(&text).ok()?;
    is_valid_antigravity_cache(&val).then_some(val)
}

fn next_history(cached: Option<&Value>, session: Option<&ParsedWindow>) -> Vec<f64> {
    let mut history: Vec<f64> = cached
        .and_then(|v| v.get("history"))
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(Value::as_f64).collect())
        .unwrap_or_default();

    let Some(win) = session else {
        return history;
    };

    let prev_reset = cached
        .and_then(|v| v.pointer("/usage/session/resets_at"))
        .and_then(Value::as_f64);
    if let Some(prev) = prev_reset {
        if win.resets_at > 0.0 && (win.resets_at - prev).abs() > 60.0 {
            history.clear();
        }
    }
    append_history(history, win.used_percentage)
}

fn response_from_cache(cached: &Value) -> Value {
    json!({
        "connected": true,
        "plan": cached.get("plan").cloned().unwrap_or_else(|| json!("Antigravity")),
        "usage": cached.get("usage").cloned().unwrap_or(Value::Null),
        "history": cached.get("history").cloned().unwrap_or_else(|| json!([])),
    })
}

fn is_fresh_cache(cached: &Value, now: u64) -> bool {
    let updated_ms = cached
        .pointer("/usage/updated_ms")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    now.saturating_sub(updated_ms) < CACHE_TTL_MS
}

fn refresh_and_save_locked(exe: &Path) -> Option<Value> {
    let parsed = run_agy_usage(exe)?;
    let now = now_ms();
    let prev = load_valid_cache();
    let history = next_history(prev.as_ref(), parsed.session.as_ref());

    let groups_json: Vec<Value> = parsed
        .groups
        .iter()
        .map(|g| {
            json!({
                "name": g.name,
                "session": g.session.as_ref().map(window_json),
                "weekly": g.weekly.as_ref().map(window_json),
            })
        })
        .collect();

    let usage = json!({
        "session": parsed.session.as_ref().map(window_json),
        "weekly": parsed.weekly.as_ref().map(window_json),
        "groups": groups_json,
        "updated_ms": now,
    });
    let saved = json!({
        "plan": "Antigravity",
        "usage": usage,
        "history": history,
    });
    let _ = write_atomic(&cache_file(), saved.to_string().as_bytes());
    if let Ok(mut last) = last_attempt_ms().lock() {
        *last = now;
    }
    Some(saved)
}

pub fn read_usage(force: bool) -> Value {
    let now = now_ms();
    if !force {
        if let Some(c) = load_valid_cache().filter(|c| is_fresh_cache(c, now)) {
            return response_from_cache(&c);
        }
    }

    let _guard = fetch_lock().lock();
    let now = now_ms();
    let cached = load_valid_cache();

    if !force {
        if let Some(ref c) = cached {
            if is_fresh_cache(c, now) {
                return response_from_cache(c);
            }
        }
        let recently_tried = last_attempt_ms()
            .lock()
            .map(|last| *last > 0 && now.saturating_sub(*last) < CACHE_TTL_MS)
            .unwrap_or(false);
        if recently_tried {
            return match cached {
                Some(c) => response_from_cache(&c),
                None => json!({ "connected": false, "plan": null, "usage": null, "history": [] }),
            };
        }
    }

    let Some(exe_path) = find_agy_exe() else {
        return match cached {
            Some(c) => response_from_cache(&c),
            None => json!({ "connected": false, "plan": null, "usage": null, "history": [] }),
        };
    };

    if let Ok(mut last) = last_attempt_ms().lock() {
        *last = now;
    }

    if let Some(fresh) = refresh_and_save_locked(&exe_path) {
        return response_from_cache(&fresh);
    }

    match cached {
        Some(c) => response_from_cache(&c),
        None => json!({ "connected": false, "plan": null, "usage": null, "history": [] }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_AGY_JSON: &str = r#"{
        "conversation_id": "",
        "status": "SUCCESS",
        "num_turns": 0,
        "command": {
            "name": "usage",
            "data": {
                "groups": [
                    {
                        "name": "Gemini Models",
                        "buckets": [
                            {
                                "id": "gemini-weekly",
                                "window": "weekly",
                                "remaining_fraction": 0.9389142394065857,
                                "reset_time": "2026-12-01T07:38:12Z"
                            },
                            {
                                "id": "gemini-5h",
                                "window": "5h",
                                "remaining_fraction": 0.7556570172309875,
                                "reset_time": "2026-11-24T12:38:12Z"
                            }
                        ]
                    },
                    {
                        "name": "Claude and GPT models",
                        "buckets": [
                            {
                                "id": "3p-weekly",
                                "window": "weekly",
                                "remaining_fraction": 1,
                                "reset_time": "2026-12-01T08:19:20Z"
                            },
                            {
                                "id": "3p-5h",
                                "window": "5h",
                                "remaining_fraction": 0.5,
                                "reset_time": "2026-11-24T13:19:20Z"
                            }
                        ]
                    }
                ]
            }
        }
    }"#;

    #[test]
    fn parses_agy_usage_json() {
        let parsed = parse_agy_usage(SAMPLE_AGY_JSON).expect("should parse agy output");
        assert_eq!(parsed.groups.len(), 2);
        let session = parsed.session.expect("session bucket");
        let weekly = parsed.weekly.expect("weekly bucket");
        assert!((session.used_percentage - 24.434298).abs() < 0.01);
        assert!((weekly.used_percentage - 6.108576).abs() < 0.01);
        assert!(session.resets_at > 1_700_000_000.0);
        assert!(weekly.resets_at > session.resets_at);
        assert_eq!(parsed.groups[1].name, "Claude and GPT models");
        assert!((parsed.groups[1].session.as_ref().unwrap().used_percentage - 50.0).abs() < 0.01);
    }

    #[test]
    fn parses_agy_json_with_leading_log_lines() {
        let noisy = format!("I1124 09:00:00 server started\n{}\n", SAMPLE_AGY_JSON.replace('\n', " "));
        let parsed = parse_agy_usage(&noisy).expect("should skip leading log lines");
        assert_eq!(parsed.groups.len(), 2);
    }

    #[test]
    fn resets_history_when_session_window_rolls_over() {
        let cached = json!({
            "usage": { "session": { "used_percentage": 40.0, "resets_at": 1_800_000_000.0 } },
            "history": [10.0, 25.0, 40.0]
        });
        let same_win = ParsedWindow { used_percentage: 48.0, resets_at: 1_800_000_010.0 };
        assert_eq!(next_history(Some(&cached), Some(&same_win)), vec![10.0, 25.0, 40.0, 48.0]);

        let new_win = ParsedWindow { used_percentage: 5.0, resets_at: 1_800_018_000.0 };
        assert_eq!(next_history(Some(&cached), Some(&new_win)), vec![5.0]);
    }

    #[test]
    fn ignores_legacy_pro_flash_cache() {
        let legacy = json!({
            "plan": "CLI",
            "usage": {
                "pro": { "used_percentage": 10.0, "resets_at": 1_800_000_000.0 },
                "flash": { "used_percentage": 5.0, "resets_at": 1_800_000_000.0 }
            }
        });
        assert!(!is_valid_antigravity_cache(&legacy));

        let modern = json!({
            "plan": "Antigravity",
            "usage": {
                "session": { "used_percentage": 24.0, "resets_at": 1_800_000_000.0 }
            }
        });
        assert!(is_valid_antigravity_cache(&modern));
    }
}
