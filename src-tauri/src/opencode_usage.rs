//! OpenCode local usage, read offline from OpenCode's local SQLite history
//! (`opencode.db`: both v2 `session_message` and v1 `message` tables) with
//! fallback to legacy JSON message files.
//!
//! Shelf never reads OpenCode's `auth.json` or makes any network request here.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};

const SESSION_MS: u64 = 5 * 3_600_000;
const DAY_MS: u64 = 86_400_000;
const WEEK_MS: u64 = 7 * DAY_MS;

#[derive(Debug, Default, Clone)]
struct Bucket {
    tokens: u64,
    input: u64,
    output: u64,
    cache: u64,
    cost: f64,
    messages: u64,
}

impl Bucket {
    fn add(&mut self, input: u64, output: u64, cache: u64, total_override: u64, cost: f64) {
        self.input = self.input.saturating_add(input);
        self.output = self.output.saturating_add(output);
        self.cache = self.cache.saturating_add(cache);
        let sum = input.saturating_add(output).saturating_add(cache);
        let total = if sum > 0 { sum } else { total_override };
        self.tokens = self.tokens.saturating_add(total);
        self.cost += cost;
        self.messages = self.messages.saturating_add(1);
    }

    fn to_json(&self) -> Value {
        json!({
            "tokens": self.tokens,
            "input": self.input,
            "output": self.output,
            "cache": self.cache,
            "cost": (self.cost * 10_000.0).round() / 10_000.0,
            "messages": self.messages,
        })
    }
}

#[derive(Debug, Default)]
struct ModelAgg {
    tokens: u64,
    cost: f64,
}

struct TempCopyGuard(PathBuf);

impl Drop for TempCopyGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn find_opencode_db() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(custom) = std::env::var("OPENCODE_DATA") {
        candidates.push(PathBuf::from(custom).join("opencode.db"));
    }
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        candidates.push(PathBuf::from(xdg).join("opencode").join("opencode.db"));
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        candidates.push(Path::new(&local).join("opencode").join("opencode.db"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        candidates.push(Path::new(&appdata).join("opencode").join("opencode.db"));
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        candidates.push(
            Path::new(&home)
                .join(".local")
                .join("share")
                .join("opencode")
                .join("opencode.db"),
        );
    }
    candidates.into_iter().find(|p| p.is_file())
}

fn find_legacy_storage_dir() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        candidates.push(Path::new(&appdata).join("opencode").join("storage").join("message"));
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        candidates.push(
            Path::new(&home)
                .join(".local")
                .join("share")
                .join("opencode")
                .join("storage")
                .join("message"),
        );
    }
    candidates.into_iter().find(|p| p.is_dir())
}

fn short_model_name(raw: &str) -> String {
    let trimmed = raw.trim();
    let last = trimmed.rsplit('/').next().unwrap_or(trimmed);
    if last.is_empty() {
        "Unknown".to_string()
    } else {
        last.to_string()
    }
}

fn extract_model_name(val: &Value) -> Option<String> {
    if let Some(s) = val.get("modelID").and_then(Value::as_str) {
        return Some(short_model_name(s));
    }
    if let Some(m) = val.get("model") {
        if let Some(s) = m.as_str() {
            return Some(short_model_name(s));
        }
        if let Some(s) = m
            .get("id")
            .or_else(|| m.get("modelID"))
            .and_then(Value::as_str)
        {
            return Some(short_model_name(s));
        }
    }
    None
}

fn normalize_ts_ms(raw: u64) -> u64 {
    if raw > 0 && raw < 10_000_000_000 {
        raw.saturating_mul(1000)
    } else {
        raw
    }
}

fn open_readonly_with_fallback(path: &Path) -> Option<(Connection, Option<TempCopyGuard>)> {
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    if let Ok(conn) = Connection::open_with_flags(path, flags) {
        let _ = conn.busy_timeout(Duration::from_millis(1000));
        let _ = conn.execute_batch("PRAGMA query_only = ON;");
        if conn.prepare("SELECT 1 FROM sqlite_master LIMIT 1").is_ok() {
            return Some((conn, None));
        }
    }

    // Windows WAL lock fallback: copy db + wal/shm into an ephemeral temp folder.
    let tmp_dir = std::env::temp_dir().join(format!(
        "shelf-opencode-{}-{}",
        std::process::id(),
        now_ms()
    ));
    std::fs::create_dir_all(&tmp_dir).ok()?;
    let guard = TempCopyGuard(tmp_dir.clone());
    let dst = tmp_dir.join("opencode.db");
    std::fs::copy(path, &dst).ok()?;
    for suffix in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{suffix}", path.display()));
        if side.is_file() {
            let _ = std::fs::copy(&side, tmp_dir.join(format!("opencode.db{suffix}")));
        }
    }
    let conn = Connection::open_with_flags(&dst, flags).ok()?;
    let _ = conn.execute_batch("PRAGMA query_only = ON;");
    Some((conn, Some(guard)))
}

struct ParsedMessage {
    ts_ms: u64,
    model: Option<String>,
    input: u64,
    output: u64,
    cache: u64,
    total_override: u64,
    cost: f64,
}

fn parse_message_json(val: &Value, fallback_ts: u64, assume_assistant: bool) -> Option<ParsedMessage> {
    if !assume_assistant {
        let role = val.get("role").and_then(Value::as_str).unwrap_or("");
        if role != "assistant" {
            return None;
        }
    }
    let tokens = val.get("tokens")?;
    let input = tokens.get("input").and_then(Value::as_u64).unwrap_or(0);
    let output = tokens.get("output").and_then(Value::as_u64).unwrap_or(0)
        + tokens.get("reasoning").and_then(Value::as_u64).unwrap_or(0);
    let cache_obj = tokens.get("cache");
    let cache_read = cache_obj
        .and_then(|c| c.get("read"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let cache_write = cache_obj
        .and_then(|c| c.get("write"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let cache = cache_read.saturating_add(cache_write);
    let total_override = tokens.get("total").and_then(Value::as_u64).unwrap_or(0);
    let cost = val.get("cost").and_then(Value::as_f64).unwrap_or(0.0).max(0.0);

    if input == 0 && output == 0 && cache == 0 && total_override == 0 && cost == 0.0 {
        return None;
    }

    let ts_raw = val
        .pointer("/time/completed")
        .or_else(|| val.pointer("/time/created"))
        .and_then(Value::as_u64)
        .unwrap_or(fallback_ts);
    let ts_ms = normalize_ts_ms(ts_raw);
    let model = extract_model_name(val);

    Some(ParsedMessage {
        ts_ms,
        model,
        input,
        output,
        cache,
        total_override,
        cost,
    })
}

fn top_models_json(map: HashMap<String, ModelAgg>) -> Vec<Value> {
    let mut models: Vec<(String, ModelAgg)> = map.into_iter().collect();
    models.sort_by(|a, b| b.1.tokens.cmp(&a.1.tokens).then_with(|| a.0.cmp(&b.0)));
    models
        .iter()
        .take(5)
        .map(|(name, agg)| {
            json!({
                "name": name,
                "tokens": agg.tokens,
                "cost": (agg.cost * 10_000.0).round() / 10_000.0,
            })
        })
        .collect()
}

fn aggregate(messages: &[ParsedMessage], now: u64) -> Value {
    let session_cutoff = now.saturating_sub(SESSION_MS);
    let week_cutoff = now.saturating_sub(WEEK_MS);

    let mut session = Bucket::default();
    let mut weekly = Bucket::default();
    let mut all_time = Bucket::default();
    let mut week_models_map: HashMap<String, ModelAgg> = HashMap::new();
    let mut all_models_map: HashMap<String, ModelAgg> = HashMap::new();
    let mut daily = [0u64; 7];

    for m in messages {
        if m.ts_ms > now.saturating_add(60_000) {
            continue;
        }
        let sum = m.input.saturating_add(m.output).saturating_add(m.cache);
        let total_tok = if sum > 0 { sum } else { m.total_override };

        all_time.add(m.input, m.output, m.cache, m.total_override, m.cost);
        if let Some(ref name) = m.model {
            let entry = all_models_map.entry(name.clone()).or_default();
            entry.tokens = entry.tokens.saturating_add(total_tok);
            entry.cost += m.cost;
        }

        if m.ts_ms < week_cutoff {
            continue;
        }
        weekly.add(m.input, m.output, m.cache, m.total_override, m.cost);
        if m.ts_ms >= session_cutoff {
            session.add(m.input, m.output, m.cache, m.total_override, m.cost);
        }
        let age_days = ((now.saturating_sub(m.ts_ms)) / DAY_MS).min(6) as usize;
        let idx = 6 - age_days;
        daily[idx] = daily[idx].saturating_add(total_tok);

        if let Some(ref name) = m.model {
            let entry = week_models_map.entry(name.clone()).or_default();
            entry.tokens = entry.tokens.saturating_add(total_tok);
            entry.cost += m.cost;
        }
    }

    let week_models = top_models_json(week_models_map);
    let all_models = top_models_json(all_models_map);
    let top_model = week_models
        .first()
        .or_else(|| all_models.first())
        .cloned()
        .unwrap_or(Value::Null);

    json!({
        "connected": true,
        "session": session.to_json(),
        "weekly": weekly.to_json(),
        "all_time": all_time.to_json(),
        "top_model": top_model,
        "models": week_models,
        "all_time_models": all_models,
        "daily_tokens": daily.to_vec(),
    })
}

fn read_table_messages(
    conn: &Connection,
    sql: &str,
    assume_assistant: bool,
    seen: &mut HashSet<String>,
    out: &mut Vec<ParsedMessage>,
) -> bool {
    let Ok(mut stmt) = conn.prepare(sql) else {
        return false;
    };
    let Ok(rows) = stmt.query_map([], |row| {
        let id: String = row.get(0).unwrap_or_default();
        let ts: i64 = row.get(1).unwrap_or(0);
        let data: String = row.get(2)?;
        Ok((id, ts.max(0) as u64, data))
    }) else {
        return false;
    };
    for item in rows.flatten() {
        let (id, ts, text) = item;
        if !id.is_empty() && !seen.insert(id) {
            continue;
        }
        if let Ok(val) = serde_json::from_str::<Value>(&text) {
            if let Some(msg) = parse_message_json(&val, ts, assume_assistant) {
                out.push(msg);
            }
        }
    }
    true
}

fn read_from_sqlite(path: &Path, now: u64) -> Option<Value> {
    let (conn, _guard) = open_readonly_with_fallback(path)?;
    let mut seen = HashSet::new();
    let mut messages = Vec::new();

    // OpenCode v2.2+ stores assistant turns in `session_message` (`type = 'assistant'`).
    let read_v2 = read_table_messages(
        &conn,
        "SELECT id, time_created, data FROM session_message WHERE type = 'assistant'",
        true,
        &mut seen,
        &mut messages,
    );
    // OpenCode v1 stores turns in `message` (`data.role = 'assistant'`).
    let read_v1 = read_table_messages(
        &conn,
        "SELECT id, time_created, data FROM message",
        false,
        &mut seen,
        &mut messages,
    );

    if !read_v1 && !read_v2 {
        return None;
    }
    Some(aggregate(&messages, now))
}

fn collect_json_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_json_files(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("json") {
            out.push(path);
        }
    }
}

fn read_from_legacy_dir(dir: &Path, now: u64) -> Value {
    let mut files = Vec::new();
    collect_json_files(dir, &mut files);
    let mut messages = Vec::new();
    for path in files {
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(val) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        if let Some(msg) = parse_message_json(&val, 0, false) {
            messages.push(msg);
        }
    }
    aggregate(&messages, now)
}

pub fn read_usage() -> Value {
    let now = now_ms();
    if let Some(db) = find_opencode_db() {
        if let Some(val) = read_from_sqlite(&db, now) {
            return val;
        }
    }
    if let Some(dir) = find_legacy_storage_dir() {
        return read_from_legacy_dir(&dir, now);
    }
    json!({
        "connected": false,
        "session": null,
        "weekly": null,
        "all_time": null,
        "top_model": null,
        "models": [],
        "all_time_models": [],
        "daily_tokens": [],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_and_aggregates_opencode_sqlite_v1_and_v2_free_models() {
        let dir = std::env::temp_dir().join(format!("shelf-opencode-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("opencode.db");

        let now = 1_800_000_000_000u64;
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT)",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT, type TEXT, seq INTEGER, time_created INTEGER, time_updated INTEGER, data TEXT)",
            [],
        )
        .unwrap();

        let recent_v1 = json!({
            "role": "assistant",
            "modelID": "anthropic/claude-sonnet-4.5",
            "tokens": { "input": 1000, "output": 500, "reasoning": 100, "cache": { "read": 400, "write": 0 } },
            "cost": 0.12,
            "time": { "created": now - 60_000, "completed": now - 55_000 }
        });
        let free_v2 = json!({
            "model": { "id": "glm-5.3-flash-free", "providerID": "opencode", "variant": "default" },
            "tokens": { "input": 2000, "output": 1000, "reasoning": 500, "cache": { "read": 500, "write": 0 } },
            "cost": 0,
            "time": { "created": now - 30_000, "completed": now - 25_000 }
        });
        let older_free_v2 = json!({
            "model": { "id": "muse-spark-free", "providerID": "opencode" },
            "tokens": { "total": 9000 },
            "cost": 0,
            "time": { "created": now - 14 * DAY_MS }
        });

        conn.execute(
            "INSERT INTO message VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["m1", "s1", (now - 60_000) as i64, recent_v1.to_string()],
        )
        .unwrap();
        // Duplicate id in session_message should be deduplicated.
        conn.execute(
            "INSERT INTO session_message VALUES (?1, ?2, 'assistant', 1, ?3, ?3, ?4)",
            rusqlite::params!["m_free", "s2", (now - 30_000) as i64, free_v2.to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO session_message VALUES (?1, ?2, 'assistant', 2, ?3, ?3, ?4)",
            rusqlite::params!["m_old", "s2", (now - 14 * DAY_MS) as i64, older_free_v2.to_string()],
        )
        .unwrap();
        drop(conn);

        let out = read_from_sqlite(&db_path, now).expect("should read sqlite");
        assert_eq!(out["connected"], true);
        assert_eq!(out["session"]["tokens"], 6000);
        assert_eq!(out["session"]["messages"], 2);
        assert_eq!(out["weekly"]["tokens"], 6000);
        assert_eq!(out["all_time"]["tokens"], 15_000);
        assert_eq!(out["all_time"]["messages"], 3);
        assert_eq!(out["top_model"]["name"], "glm-5.3-flash-free");
        assert_eq!(out["top_model"]["tokens"], 4000);
        assert_eq!(out["top_model"]["cost"], 0.0);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_legacy_json_message_directory() {
        let dir = std::env::temp_dir().join(format!("shelf-opencode-legacy-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let sub = dir.join("ses_1");
        std::fs::create_dir_all(&sub).unwrap();
        let now = 1_800_000_000_000u64;
        let msg = json!({
            "role": "assistant",
            "modelID": "claude-opus-4",
            "tokens": { "input": 300, "output": 200 },
            "cost": 0.05,
            "time": { "created": now - 10_000 }
        });
        std::fs::write(sub.join("msg_1.json"), msg.to_string()).unwrap();

        let out = read_from_legacy_dir(&dir, now);
        assert_eq!(out["connected"], true);
        assert_eq!(out["session"]["tokens"], 500);
        assert_eq!(out["top_model"]["name"], "claude-opus-4");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
