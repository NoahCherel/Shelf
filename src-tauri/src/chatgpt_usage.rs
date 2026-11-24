//! ChatGPT (Codex CLI) subscription limits, taken from Codex CLI's local session logs.
//!
//! Codex CLI writes `token_count` events with `rate_limits` into
//! `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Shelf reads those local logs
//! only and never touches Codex's login/auth files.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

const MAX_SESSION_FILES: usize = 30;
const MAX_HISTORY: usize = 24;

fn shelf_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    Path::new(&base).join("Shelf")
}

fn cache_file() -> PathBuf {
    shelf_dir().join("chatgpt_usage.json")
}

fn codex_home() -> Option<PathBuf> {
    if let Ok(custom) = std::env::var("CODEX_HOME") {
        let p = PathBuf::from(custom);
        if p.is_dir() {
            return Some(p);
        }
    }
    let home = std::env::var("USERPROFILE").ok()?;
    let p = Path::new(&home).join(".codex");
    p.is_dir().then_some(p)
}

fn collect_session_files(dir: &Path, out: &mut Vec<(SystemTime, PathBuf)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_session_files(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            let modified = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .unwrap_or(UNIX_EPOCH);
            out.push((modified, path));
        }
    }
}

fn parse_window(raw: &Value) -> Option<Value> {
    let used = raw
        .get("used_percent")
        .or_else(|| raw.get("used_percentage"))?
        .as_f64()?;
    let resets_at = raw.get("resets_at")?.as_f64()?;
    let window_minutes = raw.get("window_minutes").and_then(Value::as_f64);
    Some(json!({
        "used_percentage": used,
        "resets_at": resets_at,
        "window_minutes": window_minutes,
    }))
}

fn extract_rate_limits_from_file(path: &Path) -> Option<(Value, Option<String>)> {
    let file = std::fs::File::open(path).ok()?;
    let mut latest: Option<(Value, Option<String>)> = None;
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        if !line.contains("\"rate_limits\"") {
            continue;
        }
        let Ok(val) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let payload = val.get("payload").unwrap_or(&val);
        let Some(limits) = payload.get("rate_limits") else {
            continue;
        };
        if limits.is_null() {
            continue;
        }
        let primary = limits.get("primary").and_then(parse_window);
        let secondary = limits.get("secondary").and_then(parse_window);
        if primary.is_none() && secondary.is_none() {
            continue;
        }
        let plan = limits
            .get("plan_type")
            .and_then(Value::as_str)
            .map(str::to_owned);
        latest = Some((json!({ "primary": primary, "secondary": secondary }), plan));
    }
    latest
}

fn scan_codex_dir(codex_dir: &Path, now_ms: u64) -> Option<(Value, Option<String>)> {
    let sessions = codex_dir.join("sessions");
    let mut files = Vec::new();
    collect_session_files(&sessions, &mut files);
    // Newest session files first.
    files.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in files.into_iter().take(MAX_SESSION_FILES) {
        if let Some((mut limits, plan)) = extract_rate_limits_from_file(&path) {
            if let Some(obj) = limits.as_object_mut() {
                obj.insert("updated_ms".into(), json!(now_ms));
            }
            return Some((limits, plan));
        }
    }
    None
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("shelf-tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(tmp, path)
}

fn append_history(mut history: Vec<f64>, pct: Option<f64>) -> Vec<f64> {
    if let Some(p) = pct {
        let clamped = p.clamp(0.0, 100.0);
        let same_as_last = history
            .last()
            .is_some_and(|last| (*last - clamped).abs() < 0.05);
        if !same_as_last {
            history.push(clamped);
            if history.len() > MAX_HISTORY {
                let drop = history.len() - MAX_HISTORY;
                history.drain(0..drop);
            }
        }
    }
    history
}

fn effective_session_percent(usage: &Value, now_secs: f64) -> Option<f64> {
    let primary = usage.get("primary")?;
    let resets_at = primary.get("resets_at").and_then(Value::as_f64)?;
    if resets_at <= now_secs {
        return Some(0.0);
    }
    primary.get("used_percentage").and_then(Value::as_f64)
}

pub fn read_usage() -> Value {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let now_ms = now_secs * 1000;
    let cached = std::fs::read_to_string(cache_file())
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok());
    let prev_history: Vec<f64> = cached
        .as_ref()
        .and_then(|v| v.get("history"))
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(Value::as_f64).collect())
        .unwrap_or_default();

    let dir = codex_home();
    let fresh = dir.as_deref().and_then(|d| scan_codex_dir(d, now_ms));

    if let Some((usage, plan)) = fresh {
        let pct = effective_session_percent(&usage, now_secs as f64);
        let history = append_history(prev_history, pct);
        let saved = json!({ "usage": usage, "plan": plan, "history": history });
        let _ = write_atomic(&cache_file(), saved.to_string().as_bytes());
        return json!({
            "connected": true,
            "plan": saved["plan"],
            "usage": saved["usage"],
            "history": saved["history"],
        });
    }

    let connected = dir.is_some() || cached.is_some();
    json!({
        "connected": connected,
        "plan": cached.as_ref().and_then(|c| c.get("plan")).cloned().unwrap_or(Value::Null),
        "usage": cached.as_ref().and_then(|c| c.get("usage")).cloned().unwrap_or(Value::Null),
        "history": prev_history,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_codex_session_rate_limits() {
        let root = std::env::temp_dir().join(format!("shelf-codex-test-{}", std::process::id()));
        let day = root.join("sessions").join("2026").join("11").join("23");
        std::fs::create_dir_all(&day).unwrap();
        let content = [
            json!({ "type": "event_msg", "payload": { "type": "token_count", "rate_limits": null } }),
            json!({
                "type": "event_msg",
                "payload": {
                    "type": "token_count",
                    "rate_limits": {
                        "primary": { "used_percent": 25.0, "window_minutes": 300, "resets_at": 1_800_000_000 },
                        "secondary": { "used_percent": 18.5, "window_minutes": 10080, "resets_at": 1_800_500_000 },
                        "plan_type": "pro"
                    }
                }
            }),
        ]
        .iter()
        .map(|v| v.to_string())
        .collect::<Vec<_>>()
        .join("\n");
        std::fs::write(day.join("rollout-001.jsonl"), content).unwrap();

        let (limits, plan) = scan_codex_dir(&root, 42).unwrap();
        assert_eq!(plan.as_deref(), Some("pro"));
        assert_eq!(limits["primary"]["used_percentage"], 25.0);
        assert_eq!(limits["secondary"]["used_percentage"], 18.5);
        assert_eq!(limits["updated_ms"], 42);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn appends_history_without_duplicates_and_caps_length() {
        let mut h = Vec::new();
        h = append_history(h, Some(10.0));
        h = append_history(h, Some(10.0));
        assert_eq!(h, vec![10.0]);
        for i in 0..30 {
            h = append_history(h, Some(i as f64));
        }
        assert_eq!(h.len(), MAX_HISTORY);
        assert_eq!(*h.last().unwrap(), 29.0);
    }

    #[test]
    fn expired_primary_window_records_zero_in_history() {
        let usage = json!({ "primary": { "used_percentage": 42.0, "resets_at": 1000.0 } });
        assert_eq!(effective_session_percent(&usage, 900.0), Some(42.0));
        assert_eq!(effective_session_percent(&usage, 1000.0), Some(0.0));
    }
}
