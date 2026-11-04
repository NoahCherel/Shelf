//! Claude subscription limits, taken from Claude Code's status line feed.
//!
//! Claude Code passes `rate_limits` to its status line command, so Shelf joins
//! that command: it saves the limits to a file, then runs whatever command was
//! there before and passes its output through. Shelf never reads Claude's login
//! tokens; those are only meant for Claude Code and Anthropic's own apps.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

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

/// What the frontend shows: whether the hook is on, and the last saved limits.
pub fn read_usage() -> Value {
    let usage = std::fs::read_to_string(usage_file())
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok());
    json!({ "connected": is_connected(), "usage": usage })
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
}
