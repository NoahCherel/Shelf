//! Claude subscription limits, taken from Claude Code's status line feed.
//!
//! Claude Code passes `rate_limits` to its status line command, so Shelf joins
//! that command: it saves the limits to a file, then runs whatever command was
//! there before and passes its output through. Shelf never reads Claude's login
//! tokens; those are only meant for Claude Code and Anthropic's own apps.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde_json::{json, Value};

const STATUSLINE_FLAG: &str = "--claude-statusline";
const CHAIN_FLAG: &str = "--chain";

fn shelf_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    Path::new(&base).join("Shelf")
}

fn usage_file() -> PathBuf {
    shelf_dir().join("claude_usage.json")
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("shelf-tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(tmp, path)
}

// ------------------------------------------------------ status line command

pub fn is_statusline_call(args: &[String]) -> bool {
    args.iter().any(|a| a == STATUSLINE_FLAG)
}

/// Keeps only the limits, so nothing else from the session lands on disk.
fn extract_limits(payload: &Value, now_ms: u64) -> Option<Value> {
    let limits = payload.get("rate_limits")?;
    let window = |name: &str| {
        let w = limits.get(name)?;
        Some(json!({
            "used_percentage": w.get("used_percentage")?.as_f64()?,
            "resets_at": w.get("resets_at")?.as_f64()?,
        }))
    };
    let (five_hour, seven_day) = (window("five_hour"), window("seven_day"));
    if five_hour.is_none() && seven_day.is_none() {
        return None;
    }
    Some(json!({ "five_hour": five_hour, "seven_day": seven_day, "updated_ms": now_ms }))
}

fn chain_from_args(args: &[String]) -> Option<String> {
    let at = args.iter().position(|a| a == CHAIN_FLAG)?;
    decode_chain(args.get(at + 1)?)
}

fn decode_chain(encoded: &str) -> Option<String> {
    let bytes = URL_SAFE_NO_PAD.decode(encoded).ok()?;
    String::from_utf8(bytes).ok()
}

fn run_chain(command: &str, input: &[u8]) -> i32 {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // Outer quotes are stripped by /S, leaving the command exactly as configured.
    let child = Command::new("cmd")
        .raw_arg(format!("/S /C \"{command}\""))
        .stdin(Stdio::piped())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
    let Ok(mut child) = child else {
        return 1;
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input);
    }
    child.wait().ok().and_then(|s| s.code()).unwrap_or(1)
}

/// Runs as Claude Code's status line. Saving the limits is best effort: a
/// failure here must never take the original status line down with it.
pub fn run_statusline(args: &[String]) -> i32 {
    let mut input = Vec::new();
    let _ = std::io::stdin().read_to_end(&mut input);

    if let Ok(payload) = serde_json::from_slice::<Value>(&input) {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        if let Some(limits) = extract_limits(&payload, now_ms) {
            let _ = write_atomic(&usage_file(), limits.to_string().as_bytes());
        }
    }
    match chain_from_args(args) {
        Some(command) => run_chain(&command, &input),
        None => 0,
    }
}

// --------------------------------------------------- Claude Code settings

fn is_wrapped(settings: &Value) -> bool {
    settings
        .pointer("/statusLine/command")
        .and_then(Value::as_str)
        .is_some_and(|c| c.contains(STATUSLINE_FLAG))
}

/// Puts Shelf in front of the existing status line command. Returns false if
/// it was already there. Other statusLine fields are left alone.
fn wrap_status_line(settings: &mut Value, exe: &str) -> bool {
    if is_wrapped(settings) {
        return false;
    }
    let previous = settings
        .pointer("/statusLine/command")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let mut command = format!("\"{exe}\" {STATUSLINE_FLAG}");
    if let Some(previous) = previous {
        // Encoded so its quotes survive both settings.json and the shell.
        command = format!("{command} {CHAIN_FLAG} {}", URL_SAFE_NO_PAD.encode(previous));
    }
    match settings.get_mut("statusLine").and_then(Value::as_object_mut) {
        Some(line) => {
            line.insert("command".into(), command.into());
        }
        None => settings["statusLine"] = json!({ "type": "command", "command": command }),
    }
    true
}

/// Undoes `wrap_status_line`. Returns false if Shelf wasn't there.
fn unwrap_status_line(settings: &mut Value) -> bool {
    if !is_wrapped(settings) {
        return false;
    }
    let command = settings["statusLine"]["command"].as_str().unwrap_or_default();
    let previous = command
        .split_once(CHAIN_FLAG)
        .and_then(|(_, rest)| decode_chain(rest.trim()));
    match previous {
        Some(previous) => settings["statusLine"]["command"] = previous.into(),
        None => {
            if let Some(root) = settings.as_object_mut() {
                root.remove("statusLine");
            }
        }
    }
    true
}

/// The default Claude Code folder plus each Orca profile.
fn config_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(home) = std::env::var("USERPROFILE") {
        dirs.push(Path::new(&home).join(".claude"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        let profiles = Path::new(&appdata).join("orca").join("claude-profiles");
        if let Ok(entries) = std::fs::read_dir(profiles) {
            dirs.extend(entries.flatten().map(|e| e.path().join("home")));
        }
    }
    dirs.retain(|d| d.is_dir());
    dirs
}

fn read_settings(path: &Path) -> Result<Value, String> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(json!({})),
        Err(e) => return Err(format!("{}: {e}", path.display())),
    };
    let value: Value =
        serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    if value.is_object() {
        Ok(value)
    } else {
        Err(format!("{}: not a JSON object", path.display()))
    }
}

fn save_settings(path: &Path, settings: &Value) -> Result<(), String> {
    let backup = path.with_extension("json.shelf-backup");
    if path.exists() && !backup.exists() {
        std::fs::copy(path, &backup).map_err(|e| format!("{}: {e}", backup.display()))?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    write_atomic(path, text.as_bytes()).map_err(|e| format!("{}: {e}", path.display()))
}

/// A private copy, so the hook keeps working if Shelf is rebuilt or moved.
fn install_hook_exe() -> Result<String, String> {
    let target = shelf_dir().join("shelf-statusline.exe");
    std::fs::create_dir_all(shelf_dir()).map_err(|e| e.to_string())?;
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    if let Err(e) = std::fs::copy(current, &target) {
        // It can be busy mid-run; the existing copy does the same job.
        if !target.exists() {
            return Err(format!("{}: {e}", target.display()));
        }
    }
    Ok(target.display().to_string().replace('\\', "/"))
}

pub fn is_connected() -> bool {
    config_dirs().iter().any(|dir| {
        read_settings(&dir.join("settings.json"))
            .map(|s| is_wrapped(&s))
            .unwrap_or(false)
    })
}

/// Turns the hook on or off in every Claude Code config folder. Settings are
/// all read first, so one unreadable file means nothing gets changed.
pub fn set_connected(on: bool) -> Result<(), String> {
    let mut loaded = Vec::new();
    for dir in config_dirs() {
        let path = dir.join("settings.json");
        loaded.push((read_settings(&path)?, path));
    }
    if loaded.is_empty() {
        return Err("Claude Code isn't set up on this PC.".into());
    }
    let exe = if on { install_hook_exe()? } else { String::new() };
    for (mut settings, path) in loaded {
        let changed = if on {
            wrap_status_line(&mut settings, &exe)
        } else {
            unwrap_status_line(&mut settings)
        };
        if changed {
            save_settings(&path, &settings)?;
        }
    }
    Ok(())
}

// ------------------------------------------------- local session log stats

const LOG_WINDOW_SECS: u64 = 7 * 86_400;

/// Minimal ISO-8601 UTC timestamp parser (`YYYY-MM-DDTHH:MM:SS...`) -> Unix seconds.
pub(crate) fn parse_iso_epoch_secs(s: &str) -> Option<u64> {
    let bytes = s.as_bytes();
    if bytes.len() < 19 || bytes[4] != b'-' || bytes[7] != b'-' || bytes[13] != b':' || bytes[16] != b':' {
        return None;
    }
    let y: i64 = s.get(0..4)?.parse().ok()?;
    let m: i64 = s.get(5..7)?.parse().ok()?;
    let d: i64 = s.get(8..10)?.parse().ok()?;
    let hh: i64 = s.get(11..13)?.parse().ok()?;
    let mm: i64 = s.get(14..16)?.parse().ok()?;
    let ss: i64 = s.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) || hh > 23 || mm > 59 || ss > 60 {
        return None;
    }
    // Howard Hinnant's civil_from_days inverse.
    let y_adj = y - if m <= 2 { 1 } else { 0 };
    let era = y_adj.div_euclid(400);
    let yoe = y_adj - era * 400;
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400 + hh * 3_600 + mm * 60 + ss;
    u64::try_from(secs).ok()
}

struct CachedLogFile {
    modified: SystemTime,
    len: u64,
    entries: Vec<(Option<u64>, Option<String>, String, u64)>,
}

fn log_cache() -> &'static Mutex<HashMap<PathBuf, CachedLogFile>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, CachedLogFile>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn parse_jsonl_entries(path: &Path) -> Vec<(Option<u64>, Option<String>, String, u64)> {
    let Ok(file) = std::fs::File::open(path) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        if !line.contains("\"usage\"") {
            continue;
        }
        let Ok(val) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let msg = val.get("message").unwrap_or(&val);
        let Some(model) = msg.get("model").and_then(Value::as_str) else {
            continue;
        };
        if model.is_empty() || model == "<synthetic>" {
            continue;
        }
        let Some(usage) = msg.get("usage") else {
            continue;
        };
        let tokens = extract_usage_tokens(usage);
        if tokens == 0 {
            continue;
        }
        let ts = val
            .get("timestamp")
            .and_then(Value::as_str)
            .and_then(parse_iso_epoch_secs);
        let key = val
            .get("requestId")
            .and_then(Value::as_str)
            .or_else(|| msg.get("id").and_then(Value::as_str))
            .map(str::to_owned);
        out.push((ts, key, format_model_name(model), tokens));
    }
    out
}

/// Shortens a Claude model ID (e.g. `claude-sonnet-4-5-20250929`) for the tile.
fn format_model_name(raw: &str) -> String {
    let stripped = raw.strip_prefix("claude-").unwrap_or(raw);
    let mut parts: Vec<&str> = stripped.split('-').collect();
    // Drop trailing 8-digit release date (e.g. 20250929).
    if parts
        .last()
        .is_some_and(|p| p.len() == 8 && p.bytes().all(|b| b.is_ascii_digit()))
    {
        parts.pop();
    }
    if parts.is_empty() {
        return raw.to_string();
    }
    let cap = |s: &str| {
        let mut c = s.chars();
        match c.next() {
            Some(first) => first.to_uppercase().to_string() + c.as_str(),
            None => String::new(),
        }
    };
    let is_num = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    // Family-first: ["sonnet", "4", "5"] -> "Sonnet 4.5"
    if !is_num(parts[0]) {
        let family = cap(parts[0]);
        let ver: Vec<&str> = parts[1..].iter().copied().take_while(|p| is_num(p)).collect();
        return if ver.is_empty() {
            family
        } else {
            format!("{family} {}", ver.join("."))
        };
    }
    // Version-first: ["3", "5", "sonnet"] -> "Sonnet 3.5"
    let ver: Vec<&str> = parts.iter().copied().take_while(|p| is_num(p)).collect();
    let rest = &parts[ver.len()..];
    if let Some(family) = rest.first() {
        format!("{} {}", cap(family), ver.join("."))
    } else {
        raw.to_string()
    }
}

fn collect_jsonl_files(dir: &Path, cutoff: SystemTime, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl_files(&path, cutoff, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            let recent = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| t >= cutoff)
                .unwrap_or(true);
            if recent {
                out.push(path);
            }
        }
    }
}

fn extract_usage_tokens(usage: &Value) -> u64 {
    let field = |k: &str| usage.get(k).and_then(Value::as_u64).unwrap_or(0);
    field("input_tokens")
        + field("output_tokens")
        + field("cache_creation_input_tokens")
        + field("cache_read_input_tokens")
}

/// Reads Claude Code's local session logs (no login files) to find the most-used
/// model over the last 7 days and its token count. Unchanged files are served
/// from an in-memory mtime/size cache so polling stays cheap.
fn scan_models_in(dirs: &[PathBuf], now: SystemTime) -> Vec<(String, u64)> {
    let cutoff = now.checked_sub(Duration::from_secs(LOG_WINDOW_SECS)).unwrap_or(UNIX_EPOCH);
    let cutoff_secs = cutoff.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let mut files = Vec::new();
    for dir in dirs {
        collect_jsonl_files(&dir.join("projects"), cutoff, &mut files);
    }
    // Deduplicate streaming assistant chunks by message/request id.
    let mut by_req: HashMap<String, (String, u64)> = HashMap::new();
    let mut anon_totals: HashMap<String, u64> = HashMap::new();

    let mut cache = log_cache().lock().unwrap_or_else(|e| e.into_inner());
    for path in &files {
        let Ok(meta) = std::fs::metadata(path) else {
            continue;
        };
        let modified = meta.modified().unwrap_or(UNIX_EPOCH);
        let len = meta.len();
        let cached = cache
            .get(path)
            .is_some_and(|c| c.modified == modified && c.len == len);
        if !cached {
            let entries = parse_jsonl_entries(path);
            cache.insert(path.clone(), CachedLogFile { modified, len, entries });
        }
        if let Some(file_cache) = cache.get(path) {
            for (ts, key, name, tokens) in &file_cache.entries {
                if ts.is_some_and(|t| t < cutoff_secs) {
                    continue;
                }
                if let Some(k) = key {
                    let entry = by_req.entry(k.clone()).or_insert_with(|| (name.clone(), 0));
                    if *tokens > entry.1 {
                        *entry = (name.clone(), *tokens);
                    }
                } else {
                    *anon_totals.entry(name.clone()).or_insert(0) += *tokens;
                }
            }
        }
    }
    // Prune stale entries for deleted/old files so the cache stays bounded.
    let keep: std::collections::HashSet<&PathBuf> = files.iter().collect();
    cache.retain(|k, _| keep.contains(k));
    drop(cache);

    let mut totals = anon_totals;
    for (_, (name, tokens)) in by_req {
        *totals.entry(name).or_insert(0) += tokens;
    }
    let mut list: Vec<(String, u64)> = totals.into_iter().collect();
    list.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    list
}

/// What the frontend shows: whether the hook is on, the last saved limits, and
/// the most-used model from local session logs.
pub fn read_usage() -> Value {
    let usage = std::fs::read_to_string(usage_file())
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok());
    let connected = is_connected();
    let models = if connected {
        scan_models_in(&config_dirs(), SystemTime::now())
    } else {
        Vec::new()
    };
    let top_model = models
        .first()
        .map(|(name, tokens)| json!({ "name": name, "tokens": tokens }));
    let models_json: Vec<Value> = models
        .into_iter()
        .take(5)
        .map(|(name, tokens)| json!({ "name": name, "tokens": tokens }))
        .collect();
    json!({
        "connected": connected,
        "usage": usage,
        "top_model": top_model,
        "models": models_json,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXE: &str = "C:/Shelf/shelf-statusline.exe";
    const ORCA: &str = "C:/Users/x/.orca/agent-hooks/claude-statusline.cmd";

    /// The only test that changes the environment, pointing it at a temp folder
    /// so real Claude Code settings are never touched.
    #[test]
    fn connect_and_disconnect_across_config_folders() {
        let root = std::env::temp_dir().join(format!("shelf-test-{}", std::process::id()));
        let home = root.join("home");
        let appdata = root.join("appdata");
        let default_dir = home.join(".claude");
        let profile_dir = appdata.join("orca/claude-profiles/abc/home");
        std::fs::create_dir_all(&default_dir).unwrap();
        std::fs::create_dir_all(&profile_dir).unwrap();
        std::env::set_var("USERPROFILE", &home);
        std::env::set_var("APPDATA", &appdata);

        let default_settings = default_dir.join("settings.json");
        let profile_settings = profile_dir.join("settings.json");
        let original = format!(
            "{{\n  \"model\": \"x\",\n  \"statusLine\": {{\n    \"type\": \"command\",\n    \"command\": \"{ORCA}\"\n  }},\n  \"another\": 1\n}}"
        );
        std::fs::write(&default_settings, &original).unwrap();
        std::fs::write(&profile_settings, &original).unwrap();

        // A broken file stops everything, leaving the good one unchanged.
        std::fs::write(&profile_settings, "{ not json").unwrap();
        assert!(set_connected(true).is_err());
        assert_eq!(std::fs::read_to_string(&default_settings).unwrap(), original);
        assert!(!is_connected());
        std::fs::write(&profile_settings, &original).unwrap();

        set_connected(true).unwrap();
        assert!(is_connected());
        for path in [&default_settings, &profile_settings] {
            let text = std::fs::read_to_string(path).unwrap();
            assert!(text.contains(STATUSLINE_FLAG));
            assert!(text.find("model").unwrap() < text.find("another").unwrap(), "key order kept");
            assert_eq!(
                std::fs::read_to_string(path.with_extension("json.shelf-backup")).unwrap(),
                original
            );
        }
        assert!(shelf_dir().join("shelf-statusline.exe").exists());

        // Connecting again changes nothing and keeps the first backup.
        let connected = std::fs::read_to_string(&default_settings).unwrap();
        set_connected(true).unwrap();
        assert_eq!(std::fs::read_to_string(&default_settings).unwrap(), connected);

        set_connected(false).unwrap();
        assert!(!is_connected());
        for path in [&default_settings, &profile_settings] {
            let restored: Value =
                serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
            assert_eq!(restored["statusLine"]["command"], ORCA);
            assert_eq!(restored["another"], 1);
        }
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn keeps_only_the_limits() {
        let payload = json!({
            "session_id": "secret-ish",
            "cwd": "C:/private",
            "rate_limits": {
                "five_hour": { "used_percentage": 41.5, "resets_at": 100 },
                "seven_day": { "used_percentage": 64, "resets_at": 200 },
            },
        });
        let saved = extract_limits(&payload, 7).unwrap();
        assert_eq!(saved["five_hour"]["used_percentage"], 41.5);
        assert_eq!(saved["seven_day"]["resets_at"], 200.0);
        assert_eq!(saved["updated_ms"], 7);
        assert!(!saved.to_string().contains("secret-ish"));
        assert!(!saved.to_string().contains("private"));
    }

    #[test]
    fn ignores_payloads_without_limits() {
        assert!(extract_limits(&json!({ "model": {} }), 0).is_none());
        assert!(extract_limits(&json!({ "rate_limits": {} }), 0).is_none());
    }

    #[test]
    fn keeps_one_window_if_the_other_is_missing() {
        let payload = json!({
            "rate_limits": { "seven_day": { "used_percentage": 3, "resets_at": 9 } },
        });
        let saved = extract_limits(&payload, 0).unwrap();
        assert!(saved["five_hour"].is_null());
        assert_eq!(saved["seven_day"]["used_percentage"], 3.0);
    }

    #[test]
    fn wrap_then_unwrap_restores_the_original() {
        let original = json!({
            "model": "x",
            "statusLine": { "type": "command", "command": ORCA, "refreshInterval": 5 },
            "permissions": { "allow": ["a"] },
        });
        let mut settings = original.clone();
        assert!(wrap_status_line(&mut settings, EXE));

        let command = settings["statusLine"]["command"].as_str().unwrap();
        assert!(command.starts_with("\"C:/Shelf/shelf-statusline.exe\" --claude-statusline --chain "));
        assert!(!command.contains(ORCA), "the original is encoded, not inlined");
        assert_eq!(settings["statusLine"]["refreshInterval"], 5);

        assert!(unwrap_status_line(&mut settings));
        assert_eq!(settings, original);
    }

    #[test]
    fn wrapping_twice_does_not_nest() {
        let mut settings = json!({ "statusLine": { "type": "command", "command": ORCA } });
        assert!(wrap_status_line(&mut settings, EXE));
        let once = settings.clone();
        assert!(!wrap_status_line(&mut settings, EXE));
        assert_eq!(settings, once);
    }

    #[test]
    fn unwrap_removes_a_status_line_shelf_added() {
        let mut settings = json!({ "model": "x" });
        assert!(wrap_status_line(&mut settings, EXE));
        assert_eq!(settings["statusLine"]["type"], "command");
        assert!(unwrap_status_line(&mut settings));
        assert_eq!(settings, json!({ "model": "x" }));
    }

    #[test]
    fn unwrap_leaves_other_status_lines_alone() {
        let mut settings = json!({ "statusLine": { "type": "command", "command": ORCA } });
        let before = settings.clone();
        assert!(!unwrap_status_line(&mut settings));
        assert_eq!(settings, before);
    }

    #[test]
    fn chain_survives_the_round_trip_with_quotes() {
        let tricky = "\"C:/Program Files/x.cmd\" --a \"b c\"";
        let mut settings = json!({ "statusLine": { "type": "command", "command": tricky } });
        wrap_status_line(&mut settings, EXE);
        let args: Vec<String> = settings["statusLine"]["command"]
            .as_str()
            .unwrap()
            .split_whitespace()
            .map(str::to_owned)
            .collect();
        assert!(is_statusline_call(&args));
        assert_eq!(chain_from_args(&args).as_deref(), Some(tricky));
    }

    #[test]
    fn formats_claude_model_names() {
        assert_eq!(format_model_name("claude-sonnet-4-5-20250929"), "Sonnet 4.5");
        assert_eq!(format_model_name("claude-opus-4-6"), "Opus 4.6");
        assert_eq!(format_model_name("claude-3-5-sonnet-20241022"), "Sonnet 3.5");
        assert_eq!(format_model_name("claude-haiku-4-5-20251001"), "Haiku 4.5");
    }

    #[test]
    fn scans_top_model_and_deduplicates_requests() {
        let root = std::env::temp_dir().join(format!("shelf-claude-logs-{}", std::process::id()));
        let proj = root.join("projects").join("demo");
        std::fs::create_dir_all(&proj).unwrap();
        let log = [
            json!({
                "requestId": "req_1",
                "message": { "model": "claude-sonnet-4-5-20250929", "usage": { "input_tokens": 100, "output_tokens": 20 } }
            }),
            // Duplicate streaming chunk with higher output_tokens replaces the earlier one.
            json!({
                "requestId": "req_1",
                "message": { "model": "claude-sonnet-4-5-20250929", "usage": { "input_tokens": 100, "output_tokens": 80 } }
            }),
            json!({
                "requestId": "req_2",
                "message": { "model": "claude-opus-4-6", "usage": { "input_tokens": 500, "output_tokens": 100, "cache_read_input_tokens": 400 } }
            }),
            json!({
                "requestId": "req_3",
                "message": { "model": "<synthetic>", "usage": { "input_tokens": 9999 } }
            }),
            // Old entry (> 7 days ago) inside a recently modified file must be skipped.
            json!({
                "timestamp": "2020-01-01T00:00:00Z",
                "requestId": "req_old",
                "message": { "model": "claude-haiku-4-5-20251001", "usage": { "input_tokens": 50000 } }
            }),
        ]
        .iter()
        .map(|v| v.to_string())
        .collect::<Vec<_>>()
        .join("\n");
        std::fs::write(proj.join("session.jsonl"), log).unwrap();

        let models = scan_models_in(&[root.clone()], SystemTime::now());
        assert_eq!(models, vec![("Opus 4.6".into(), 1000), ("Sonnet 4.5".into(), 180)]);
        let _ = std::fs::remove_dir_all(root);
    }
}
