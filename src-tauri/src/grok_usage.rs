//! Grok CLI credits usage via the official `grok agent stdio` ACP JSON-RPC
//! interface (`_x.ai/billing`), cached in `app_dir()/grok_usage.json`.
//!
//! Shelf never reads `~/.grok/auth.json` or xAI OAuth tokens directly.

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

use crate::claude_usage::parse_iso_epoch_secs;
use crate::store::app_dir;

const MAX_HISTORY: usize = 24;
const CACHE_TTL_MS: u64 = 60_000;
const GROK_TIMEOUT: Duration = Duration::from_secs(15);
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

fn cache_file() -> PathBuf {
    app_dir().join("grok_usage.json")
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn find_grok_exe() -> Option<PathBuf> {
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            for name in ["grok.exe", "grok.cmd", "grok.bat", "grok"] {
                let candidate = dir.join(name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        let p = Path::new(&appdata).join("npm").join("grok.cmd");
        if p.is_file() {
            return Some(p);
        }
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        for rel in [".local/bin/grok.exe", ".grok/bin/grok.exe"] {
            let p = Path::new(&home).join(rel);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

#[derive(Debug, Clone, PartialEq)]
struct ParsedGrokUsage {
    plan: Option<String>,
    used_percentage: f64,
    resets_at: f64,
}

fn parse_reset_secs(val: &Value) -> Option<f64> {
    if let Some(n) = val.as_f64() {
        return Some(if n > 1e12 { n / 1000.0 } else { n });
    }
    if let Some(s) = val.as_str() {
        return parse_iso_epoch_secs(s).map(|sec| sec as f64);
    }
    None
}

fn parse_billing_payload(root: &Value) -> Option<ParsedGrokUsage> {
    let payload = root
        .get("result")
        .or_else(|| root.get("billing"))
        .or_else(|| root.get("data"))
        .unwrap_or(root);

    let used_pct = payload
        .get("used_percentage")
        .or_else(|| payload.get("usedPercent"))
        .or_else(|| payload.get("percentage"))
        .and_then(Value::as_f64)
        .or_else(|| {
            let rem = payload
                .get("remaining_fraction")
                .or_else(|| payload.get("remainingFraction"))
                .and_then(Value::as_f64)?;
            Some((1.0 - rem) * 100.0)
        })
        .or_else(|| {
            let used = payload
                .get("used")
                .or_else(|| payload.get("creditsUsed"))
                .or_else(|| payload.get("credits_used"))
                .and_then(Value::as_f64)?;
            let limit = payload
                .get("limit")
                .or_else(|| payload.get("creditsLimit"))
                .or_else(|| payload.get("credits_limit"))
                .or_else(|| payload.get("total"))
                .and_then(Value::as_f64)?;
            if limit > 0.0 {
                Some((used / limit) * 100.0)
            } else {
                None
            }
        })?;

    let resets_at = payload
        .get("resets_at")
        .or_else(|| payload.get("resetsAt"))
        .or_else(|| payload.get("renewal_at"))
        .or_else(|| payload.get("renewalAt"))
        .or_else(|| payload.get("reset_time"))
        .and_then(parse_reset_secs)
        .unwrap_or(0.0);

    let plan = payload
        .get("plan")
        .or_else(|| payload.get("tier"))
        .or_else(|| payload.get("subscription"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned);

    Some(ParsedGrokUsage {
        plan,
        used_percentage: used_pct.clamp(0.0, 100.0),
        resets_at,
    })
}

fn parse_acp_response_lines(output: &str) -> Option<ParsedGrokUsage> {
    for line in output.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with('{') {
            continue;
        }
        let Ok(val) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        if val.get("id").and_then(Value::as_i64) == Some(2) || val.get("result").is_some() {
            if let Some(parsed) = parse_billing_payload(&val) {
                return Some(parsed);
            }
        }
    }
    None
}

fn run_grok_billing(exe: &Path) -> Option<ParsedGrokUsage> {
    let mut cmd = Command::new(exe);
    cmd.args(["agent", "stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().ok()?;
    let mut stdin = child.stdin.take()?;
    let stdout = child.stdout.take()?;

    let init_req = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": { "protocolVersion": 1, "clientInfo": { "name": "shelf", "version": "0.1.0" } }
    });
    let billing_req = json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "_x.ai/billing",
        "params": {}
    });

    let _ = writeln!(stdin, "{init_req}");
    let _ = writeln!(stdin, "{billing_req}");
    let _ = stdin.flush();
    drop(stdin);

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut collected = String::new();
        for line in reader.lines().map_while(Result::ok) {
            if let Ok(val) = serde_json::from_str::<Value>(line.trim()) {
                if val.get("id").and_then(Value::as_i64) == Some(2) && val.get("error").is_some() {
                    let _ = tx.send(None);
                    return;
                }
            }
            collected.push_str(&line);
            collected.push('\n');
            if let Some(parsed) = parse_acp_response_lines(&collected) {
                let _ = tx.send(Some(parsed));
                return;
            }
        }
        let _ = tx.send(parse_acp_response_lines(&collected));
    });

    let result = rx.recv_timeout(GROK_TIMEOUT).ok().flatten();
    let _ = child.kill();
    let _ = child.wait();
    result
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

fn next_history(cached: Option<&Value>, parsed: &ParsedGrokUsage) -> Vec<f64> {
    let mut history: Vec<f64> = cached
        .and_then(|v| v.get("history"))
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(Value::as_f64).collect())
        .unwrap_or_default();

    let prev_reset = cached
        .and_then(|v| v.pointer("/usage/credits/resets_at"))
        .and_then(Value::as_f64);
    if let Some(prev) = prev_reset {
        if parsed.resets_at > 0.0 && (parsed.resets_at - prev).abs() > 60.0 {
            history.clear();
        }
    }
    append_history(history, parsed.used_percentage)
}

fn load_cache() -> Option<Value> {
    let text = std::fs::read_to_string(cache_file()).ok()?;
    let val = serde_json::from_str::<Value>(&text).ok()?;
    val.pointer("/usage/credits")
        .is_some_and(|v| !v.is_null())
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

pub fn read_usage(force: bool) -> Value {
    let now = now_ms();
    if !force {
        if let Some(c) = load_cache().filter(|c| is_fresh_cache(c, now)) {
            return response_from_cache(&c);
        }
    }

    let _guard = fetch_lock().lock();
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

    let Some(exe) = find_grok_exe() else {
        return match cached {
            Some(c) => response_from_cache(&c),
            None => json!({ "connected": false, "plan": null, "usage": null, "history": [] }),
        };
    };

    if let Ok(mut last) = last_attempt_ms().lock() {
        *last = now;
    }

    if let Some(parsed) = run_grok_billing(&exe) {
        let history = next_history(cached.as_ref(), &parsed);
        let saved = json!({
            "plan": parsed.plan,
            "usage": {
                "credits": {
                    "used_percentage": parsed.used_percentage,
                    "resets_at": parsed.resets_at,
                },
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
    fn parses_acp_billing_response_with_credits_ratio() {
        let out = concat!(
            r#"{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}"#,
            "\n",
            r#"{"jsonrpc":"2.0","id":2,"result":{"plan":"SuperGrok","creditsUsed":34,"creditsLimit":100,"resetsAt":"2026-12-01T00:00:00Z"}}"#,
            "\n"
        );
        let parsed = parse_acp_response_lines(out).expect("should parse billing");
        assert_eq!(parsed.plan.as_deref(), Some("SuperGrok"));
        assert!((parsed.used_percentage - 34.0).abs() < 0.01);
        assert!(parsed.resets_at > 1_700_000_000.0);
    }

    #[test]
    fn parses_direct_percentage_and_ms_reset() {
        let val = json!({
            "result": {
                "tier": "X Premium+",
                "used_percentage": 62.5,
                "resets_at": 1_800_000_000_000.0
            }
        });
        let parsed = parse_billing_payload(&val).expect("should parse");
        assert_eq!(parsed.plan.as_deref(), Some("X Premium+"));
        assert!((parsed.used_percentage - 62.5).abs() < 0.01);
        assert!((parsed.resets_at - 1_800_000_000.0).abs() < 1.0);
    }

    #[test]
    fn resets_history_on_new_billing_cycle() {
        let cached = json!({
            "usage": { "credits": { "used_percentage": 50.0, "resets_at": 1_800_000_000.0 } },
            "history": [20.0, 50.0]
        });
        let same = ParsedGrokUsage { plan: None, used_percentage: 55.0, resets_at: 1_800_000_010.0 };
        assert_eq!(next_history(Some(&cached), &same), vec![20.0, 50.0, 55.0]);

        let rolled = ParsedGrokUsage { plan: None, used_percentage: 4.0, resets_at: 1_802_592_000.0 };
        assert_eq!(next_history(Some(&cached), &rolled), vec![4.0]);
    }
}
