//! Cursor usage quotas via Cursor's local sign-in (`state.vscdb`, read-only in
//! Rust memory only) and `api2.cursor.sh`, cached in `app_dir()/cursor_usage.json`.
//!
//! The access token never leaves Rust and is never persisted by Shelf.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};

use crate::claude_usage::parse_iso_epoch_secs;
use crate::store::app_dir;

const MAX_HISTORY: usize = 24;
const CACHE_TTL_MS: u64 = 60_000;
const USAGE_URL: &str = "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";

static LAST_ATTEMPT_MS: OnceLock<Mutex<u64>> = OnceLock::new();
static FETCH_LOCK: OnceLock<tauri::async_runtime::Mutex<()>> = OnceLock::new();

fn last_attempt_ms() -> &'static Mutex<u64> {
    LAST_ATTEMPT_MS.get_or_init(|| Mutex::new(0))
}

fn fetch_lock() -> &'static tauri::async_runtime::Mutex<()> {
    FETCH_LOCK.get_or_init(|| tauri::async_runtime::Mutex::new(()))
}

struct TempCopyGuard(PathBuf);

impl Drop for TempCopyGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn cache_file() -> PathBuf {
    app_dir().join("cursor_usage.json")
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn find_cursor_db() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    let p = Path::new(&appdata)
        .join("Cursor")
        .join("User")
        .join("globalStorage")
        .join("state.vscdb");
    p.is_file().then_some(p)
}

fn read_token_from_db(path: &Path) -> Option<String> {
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let query = |conn: &Connection| -> Option<String> {
        let _ = conn.busy_timeout(Duration::from_millis(800));
        let _ = conn.execute_batch("PRAGMA query_only = ON;");
        let raw: String = conn
            .query_row(
                "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken' LIMIT 1",
                [],
                |row| match row.get_ref(0)? {
                    ValueRef::Text(b) | ValueRef::Blob(b) => Ok(String::from_utf8_lossy(b).into_owned()),
                    _ => Err(rusqlite::Error::InvalidQuery),
                },
            )
            .ok()?;
        let trimmed = raw.trim().trim_matches('"').to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    };

    if let Ok(conn) = Connection::open_with_flags(path, flags) {
        if let Some(tok) = query(&conn) {
            return Some(tok);
        }
    }

    // WAL lock fallback on Windows: ephemeral copy removed immediately via Drop.
    let tmp_dir = std::env::temp_dir().join(format!(
        "shelf-cursor-{}-{}",
        std::process::id(),
        now_ms()
    ));
    std::fs::create_dir_all(&tmp_dir).ok()?;
    let _guard = TempCopyGuard(tmp_dir.clone());
    let dst = tmp_dir.join("state.vscdb");
    std::fs::copy(path, &dst).ok()?;
    for suffix in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{suffix}", path.display()));
        if side.is_file() {
            let _ = std::fs::copy(&side, tmp_dir.join(format!("state.vscdb{suffix}")));
        }
    }
    let conn = Connection::open_with_flags(&dst, flags).ok()?;
    query(&conn)
}

#[derive(Debug, Clone, PartialEq)]
struct ParsedCursorUsage {
    plan: Option<String>,
    auto_percent: Option<f64>,
    api_percent: Option<f64>,
    on_demand_cents: Option<f64>,
    resets_at: f64,
}

fn parse_ts_secs(val: &Value) -> Option<f64> {
    if let Some(n) = val.as_f64() {
        return Some(if n > 1e12 { n / 1000.0 } else { n });
    }
    if let Some(s) = val.as_str() {
        if let Ok(n) = s.parse::<f64>() {
            return Some(if n > 1e12 { n / 1000.0 } else { n });
        }
        return parse_iso_epoch_secs(s).map(|sec| sec as f64);
    }
    None
}

fn ratio_percent(used: Option<f64>, limit: Option<f64>) -> Option<f64> {
    let u = used?;
    let l = limit?;
    if l > 0.0 {
        Some(((u / l) * 100.0).clamp(0.0, 100.0))
    } else {
        None
    }
}

fn parse_cursor_response(val: &Value) -> Option<ParsedCursorUsage> {
    let resets_at = val
        .get("billingCycleEnd")
        .or_else(|| val.get("billing_cycle_end"))
        .or_else(|| val.pointer("/planUsage/billingCycleEnd"))
        .and_then(parse_ts_secs)
        .unwrap_or(0.0);

    let plan_usage = val.get("planUsage").or_else(|| val.get("plan_usage"));
    let auto_percent = plan_usage
        .and_then(|p| {
            p.get("autoPercentUsed")
                .or_else(|| p.get("totalPercentUsed"))
                .and_then(Value::as_f64)
                .or_else(|| {
                    ratio_percent(
                        p.get("totalSpend").and_then(Value::as_f64),
                        p.get("limit").and_then(Value::as_f64),
                    )
                })
        })
        .or_else(|| {
            ratio_percent(
                val.get("totalSpend").and_then(Value::as_f64),
                val.get("limit").and_then(Value::as_f64),
            )
        })
        .map(|p| p.clamp(0.0, 100.0));

    let spend_limit = val.get("spendLimitUsage").or_else(|| val.get("spend_limit_usage"));
    let api_percent = plan_usage
        .and_then(|p| p.get("apiPercentUsed").and_then(Value::as_f64))
        .or_else(|| {
            spend_limit.and_then(|s| {
                ratio_percent(
                    s.get("individualUsed").or_else(|| s.get("pooledUsed")).and_then(Value::as_f64),
                    s.get("individualLimit").or_else(|| s.get("pooledLimit")).and_then(Value::as_f64),
                )
            })
        })
        .map(|p| p.clamp(0.0, 100.0));

    if auto_percent.is_none() && api_percent.is_none() {
        return None;
    }

    let on_demand_cents = spend_limit
        .and_then(|s| {
            s.get("individualUsed")
                .or_else(|| s.get("pooledUsed"))
                .and_then(Value::as_f64)
        })
        .or_else(|| {
            val.get("onDemandSpend")
                .or_else(|| val.get("on_demand_spend"))
                .and_then(Value::as_f64)
        });

    let plan = val
        .get("membershipType")
        .or_else(|| val.get("plan"))
        .or_else(|| val.get("planName"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            let mut chars = s.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        });

    Some(ParsedCursorUsage {
        plan,
        auto_percent,
        api_percent,
        on_demand_cents,
        resets_at,
    })
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension(format!("shelf-tmp-{}-{}", std::process::id(), now_ms()));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(tmp, path)
}

fn append_history(mut history: Vec<f64>, pct: Option<f64>) -> Vec<f64> {
    if let Some(p) = pct {
        let clamped = p.clamp(0.0, 100.0);
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
    }
    history
}

fn next_history(cached: Option<&Value>, parsed: &ParsedCursorUsage) -> Vec<f64> {
    let mut history: Vec<f64> = cached
        .and_then(|v| v.get("history"))
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(Value::as_f64).collect())
        .unwrap_or_default();

    let prev_reset = cached
        .and_then(|v| v.pointer("/usage/renewal_at"))
        .and_then(Value::as_f64);
    if let Some(prev) = prev_reset {
        if parsed.resets_at > 0.0 && (parsed.resets_at - prev).abs() > 60.0 {
            history.clear();
        }
    }
    append_history(history, parsed.auto_percent.or(parsed.api_percent))
}

fn load_cache() -> Option<Value> {
    let text = std::fs::read_to_string(cache_file()).ok()?;
    let val = serde_json::from_str::<Value>(&text).ok()?;
    let usage = val.get("usage")?;
    (usage.get("auto").is_some_and(|v| !v.is_null())
        || usage.get("api").is_some_and(|v| !v.is_null()))
    .then_some(val)
}

fn is_fresh_cache(cached: &Value, now: u64) -> bool {
    let updated_ms = cached
        .pointer("/usage/updated_ms")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    now.saturating_sub(updated_ms) < CACHE_TTL_MS
}

fn response_from_cache(cached: &Value) -> Value {
    json!({
        "connected": true,
        "plan": cached.get("plan").cloned().unwrap_or(Value::Null),
        "usage": cached.get("usage").cloned().unwrap_or(Value::Null),
        "history": cached.get("history").cloned().unwrap_or_else(|| json!([])),
    })
}

async fn fetch_remote(client: &reqwest::Client, token: &str) -> Option<ParsedCursorUsage> {
    let resp = client
        .post(USAGE_URL)
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .header("Connect-Protocol-Version", "1")
        .body("{}")
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let body = resp.text().await.ok()?;
    let val = serde_json::from_str::<Value>(&body).ok()?;
    parse_cursor_response(&val)
}

pub async fn read_usage(client: &reqwest::Client, force: bool) -> Value {
    let now = now_ms();
    if !force {
        if let Some(c) = load_cache().filter(|c| is_fresh_cache(c, now)) {
            return response_from_cache(&c);
        }
    }

    let _guard = fetch_lock().lock().await;
    let now = now_ms();
    let cached = load_cache();
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

    let Some(db) = find_cursor_db() else {
        return match cached {
            Some(c) => response_from_cache(&c),
            None => json!({ "connected": false, "plan": null, "usage": null, "history": [] }),
        };
    };

    let Some(token) = read_token_from_db(&db) else {
        return match cached {
            Some(c) => response_from_cache(&c),
            None => json!({ "connected": false, "plan": null, "usage": null, "history": [] }),
        };
    };

    if let Ok(mut last) = last_attempt_ms().lock() {
        *last = now;
    }

    if let Some(parsed) = fetch_remote(client, &token).await {
        let history = next_history(cached.as_ref(), &parsed);
        let auto = parsed
            .auto_percent
            .map(|p| json!({ "used_percentage": p, "resets_at": parsed.resets_at }));
        let api = parsed
            .api_percent
            .map(|p| json!({ "used_percentage": p, "resets_at": parsed.resets_at }));
        let saved = json!({
            "plan": parsed.plan,
            "usage": {
                "auto": auto,
                "api": api,
                "on_demand_cents": parsed.on_demand_cents,
                "renewal_at": parsed.resets_at,
                "updated_ms": now,
            },
            "history": history,
        });
        let _ = write_atomic(&cache_file(), saved.to_string().as_bytes());
        return response_from_cache(&saved);
    }

    match cached {
        Some(c) => response_from_cache(&c),
        None => json!({ "connected": false, "plan": null, "usage": null, "history": [] }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_cursor_current_period_usage() {
        let payload = json!({
            "billingCycleEnd": "1800000000000",
            "membershipType": "pro",
            "planUsage": {
                "totalSpend": 840,
                "limit": 2000,
                "autoPercentUsed": 42.0,
                "apiPercentUsed": 18.5
            },
            "spendLimitUsage": {
                "individualUsed": 350,
                "individualLimit": 2000
            }
        });
        let parsed = parse_cursor_response(&payload).expect("should parse cursor response");
        assert_eq!(parsed.plan.as_deref(), Some("Pro"));
        assert_eq!(parsed.auto_percent, Some(42.0));
        assert_eq!(parsed.api_percent, Some(18.5));
        assert_eq!(parsed.on_demand_cents, Some(350.0));
        assert!((parsed.resets_at - 1_800_000_000.0).abs() < 1.0);
    }

    #[test]
    fn reads_access_token_from_temp_state_vscdb() {
        let dir = std::env::temp_dir().join(format!("shelf-cursor-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("state.vscdb");

        let conn = Connection::open(&db).unwrap();
        conn.execute("CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)", [])
            .unwrap();
        conn.execute(
            "INSERT INTO ItemTable (key, value) VALUES ('cursorAuth/accessToken', '\"tok_123\"')",
            [],
        )
        .unwrap();
        drop(conn);

        assert_eq!(read_token_from_db(&db).as_deref(), Some("tok_123"));

        // Also verify BLOB storage class (used by real VS Code / Cursor state.vscdb).
        let conn = Connection::open(&db).unwrap();
        conn.execute(
            "INSERT INTO ItemTable (key, value) VALUES ('cursorAuth/accessToken', ?1)",
            rusqlite::params![b"\"tok_blob_456\"".as_slice()],
        )
        .unwrap();
        drop(conn);

        assert_eq!(read_token_from_db(&db).as_deref(), Some("tok_blob_456"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
