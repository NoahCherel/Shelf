# Shelf — handoff notes

> **Superseded (2026-11-04).** The owner judged the current build not good enough and is
> restarting from a full study of the reference app: see `docs/lumabar/README.md`. Don't
> extend the code below until an implementation plan exists. The notes remain useful for
> what already works on Windows.

Shelf is a personal widget dock for Windows 10/11 that replaces the taskbar
(inspired by the idea of lumabar, but an original design: don't copy its name,
look or assets). Built with **Tauri v2** (Rust backend + plain HTML/CSS/JS
frontend, no bundler).

Next agent: read this file, then continue from "What's left". Build and test
on this Windows machine with `npm install` then `npm run dev`.

## Status

### Done
- `src-tauri/Cargo.toml` — deps: tauri 2 (tray-icon), sysinfo 0.33, reqwest 0.12
  (native-tls, so no C toolchain needed for TLS), png, base64, windows 0.61.
- `src-tauri/tauri.conf.json` — two windows, both hidden at start:
  - `dock` (index.html): undecorated, transparent, acrylic, always-on-top,
    skip-taskbar, 52 px tall. Rust positions it at the bottom of the primary monitor.
  - `panel` (panel.html): 380x480 pop-up shown above a clicked widget, acrylic.
  - `withGlobalTauri: true` so the frontend uses `window.__TAURI__` without a bundler.
  - `frontendDist: "../src"`.
- `src-tauri/capabilities/default.json` — `core:default` for both windows.
- `src-tauri/src/main.rs` — calls `shelf_lib::run()`.
- `src-tauri/src/win.rs` — **complete and type-checked against windows 0.61**
  (checked on Linux with patched crates, never run on real Windows yet):
  - `hide_taskbar()` / `restore_taskbar()` — sets taskbar auto-hide, hides all
    `Shell_TrayWnd` / `Shell_SecondaryTrayWnd`; original auto-hide state saved in
    `%APPDATA%\Shelf\taskbar_state.txt` so it can be restored after a crash.
  - `register_appbar(hwnd, rect) -> rect` / `unregister_appbar(hwnd)` — bottom-edge
    appbar so maximized windows stop above the dock. Rect is in physical pixels.
  - `list_windows() -> Vec<WinInfo>` (hwnd, title, exe, icon data-URL PNG, active);
    filters invisible/owned/tool/cloaked/untitled/own-process windows; icons cached per exe.
  - `focus_window(hwnd)` — focus, or minimize if it was already the active app
    (tracks last non-Shelf foreground window, since clicking the dock steals focus).
  - `foreground_is_fullscreen()` — for hiding the dock during games/videos.
  - `media_info()` / `media_cmd("toggle"|"pause"|"play"|"next"|"prev")` via
    GlobalSystemMediaTransportControls (WinRT, blocking `.get()` — call off the main thread).
  - `battery() -> Option<(percent, charging)>`, `open_start()` (taps Win key),
    `set_autostart(bool)` (HKCU Run key via `reg`), `open_url(url)`.

### What's left
1. **`src-tauri/src/lib.rs`** (doesn't exist yet). Plan:
   - `pub fn run()`: if args contain `--restore-taskbar`, call `win::restore_taskbar()` and exit.
   - Install a panic hook that calls `win::restore_taskbar()`.
   - Managed state: `Mutex<sysinfo::System>`, panel state `{ open: Option<String>, hidden_at: Instant, last_name }`.
   - Setup: get `dock` window, primary monitor size/position/scale; height = 52 * scale;
     `win::hide_taskbar()`; `win::register_appbar(dock.hwnd().0 as isize, rect)`;
     set dock position/size to the granted rect; show it.
     (Convert HWNDs via `.0 as isize` — Tauri may use a different `windows` crate version.)
   - Background thread every 1 s: `foreground_is_fullscreen()` → hide/show dock on change.
   - Panel window: on `WindowEvent::Focused(false)` hide it and record name + time.
   - Tray icon (default window icon) with menu: Settings (opens settings panel), Quit.
   - `RunEvent::Exit`: `unregister_appbar` + `restore_taskbar`.
   - Commands (`#[tauri::command]`):
     - `sys_stats() -> { cpu, mem_used, mem_total, battery }` (sysinfo:
       `refresh_cpu_usage`, `global_cpu_usage`, `refresh_memory`).
     - `list_windows`, `focus_window(hwnd: isize)`.
     - `media_info`, `media_cmd(cmd)` — async, wrap in `tauri::async_runtime::spawn_blocking`.
     - `http_request(method, url, headers: HashMap, body: Option<String>) -> { status, body }`
       via reqwest (15 s timeout, UA "Shelf-dock") — the frontend uses this for every
       API call to avoid CORS.
     - `show_panel(name, x)` — x is the widget's logical center X in the dock.
       Toggle: same name already open → hide. Same name hidden < 250 ms ago → do nothing
       (it was just closed by the blur from this very click). Else position panel above
       the dock (clamped to screen), `emit_to("panel", "open-panel", name)`, show, focus.
     - `hide_panel`, `open_start`, `open_url`, `set_autostart(on)`, `quit`.
   - Provide `#[cfg(not(windows))]` stubs for `win::*` if you want it to compile elsewhere.
2. **Frontend in `src/`** (doesn't exist yet): `index.html` (dock), `panel.html`,
   `style.css`, `shared.js` (storage + fetchers), `dock.js`, `panel.js`.
   - Storage in `localStorage` (shared between both windows, same origin): settings,
     todos, notes, pomodoro `{ mode, endsAt, running }`, cached API results with TTL.
     After any save, `window.__TAURI__.event.emit('data-changed')` so the other window refreshes.
   - Dock layout: [Start button][running apps][spacer][widget chips][clock].
     Clicking a chip calls `show_panel(name, centerX)`.
   - Widgets (dock chip → panel detail):
     - Clock/date → calendar agenda.
     - Weather → Open-Meteo (geocode the city from settings) → hourly/daily forecast.
     - System stats (poll 2 s) → CPU/RAM/battery detail.
     - Running apps (poll 1.5 s) → icons, active indicator, click = `focus_window`.
     - Now playing → title/artist + prev/play/next.
     - Pomodoro → countdown → start/pause/reset, work/break lengths.
     - Todos (count) and Notes → editable lists.
     - Calendar: fetch iCal URLs from settings through `http_request`, parse VEVENTs
       (unfold lines; DTSTART with Z = UTC, TZID = treat as local, VALUE=DATE = all-day;
       expand simple RRULE DAILY/WEEKLY with INTERVAL/BYDAY/UNTIL/COUNT over the next 14 days).
       **Automation:** every 30 s, if a timed event starts within 60 s and media is
       playing → `media_cmd("pause")` once per event, show a small toast.
     - GitHub: `GET https://api.github.com/users/{user}/events?per_page=100`
       (optional token) → commits pushed today; panel lists recent events.
     - Stripe: `GET https://api.stripe.com/v1/charges?created[gte]=<month start>&limit=100`
       with a restricted key → sum succeeded, non-refunded amounts (today + month).
     - AI API spend (month to date):
       - Anthropic: `GET https://api.anthropic.com/v1/organizations/cost_report?starting_at=<RFC3339 month start>&limit=31`,
         headers `x-api-key: <admin key sk-ant-admin...>`, `anthropic-version: 2023-06-01`.
         Sum `data[].results[].amount` — **amounts are decimal strings in cents**.
         (Marked legacy; `/v1/organizations/analytics/cost` is the newer endpoint.)
       - OpenAI: `GET https://api.openai.com/v1/organization/costs?start_time=<unix>&limit=31`
         with an admin key → sum `data[].results[].amount.value` (USD).
       - DeepSeek: `GET https://api.deepseek.com/user/balance` → `balance_infos[].total_balance`.
       - Optional monthly budget in settings: chip turns amber above 80%.
     - Settings panel: city, 24h clock, GitHub user/token, Stripe key, Anthropic/OpenAI
       admin keys, DeepSeek key, iCal URLs (one per line), widget on/off toggles,
       auto-pause before meetings, start with Windows.
   - Look: dark translucent bar over the acrylic, rounded chips ~36 px tall,
     Segoe UI Variable, also handle light mode.
3. **Icons**: `src-tauri/icons/` has placeholder icons generated from a simple shape;
   replace if you like (`npx tauri icon some.png`).
4. **README.md** with setup, the crash-recovery note, and where API keys are stored.

## Update (2026-11-04): "What's left" items 1, 2 and 4 are done
`lib.rs`, the frontend and `README.md` now exist, and the app has been run on
real Windows (dev and release builds, 125% scale). Item 3, the icons, is still
placeholders. Changes from the plan above:
- GitHub `PushEvent` payloads no longer include `commits` or `size`, so commits
  are counted with the compare API (`before...head`).
- The taskbar is re-hidden every second: Explorer shows it again after an
  auto-hide change, or when Explorer restarts.
- Settings has a Quit button, since the tray is hidden along with the taskbar.
- `sys_stats` refreshes CPU at most once a second, because the dock and panel
  both poll it and back-to-back refreshes reported 100%.
- `additionalBrowserArgs` turns off timer throttling, so meeting auto-pause
  still runs while the dock is hidden for fullscreen apps. Set it to the same
  value on both windows, because they share a WebView2 environment.

Never run against real responses: Stripe, Anthropic, OpenAI and DeepSeek (no
keys; only the summing logic has fixture tests), the GitHub widget end to end,
and media controls and auto-pause (nothing was playing). Also untested: light
mode, a second monitor, and running with `--restore-taskbar` from an installed copy.

## Update (2026-11-04, later): new look and Claude usage
The user supplied a mockup and asked for the bar to match it, which replaces the
"original design" note at the top of this file. Design decisions from measuring it:
- No acrylic. The windows are clear, and the bar is about 47% black, because the
  mockup's background stays sharp and only dims.
- Bare icon + dot means running; a hairline cell means pinned and not running.
  Other widgets moved behind the chevron ("more" panel).
- The dark theme is the only one now; the old light tokens are gone.

Claude limits replace the Anthropic admin key. The source is the status line's
`rate_limits` (see `claude_usage.rs`). Don't read `.credentials.json` or call the
OAuth usage endpoint: Anthropic's terms don't allow other tools to use those
tokens. `.claude.json`'s `cachedUsageUtilization` isn't an option either, as it
only refreshes on `/usage`.

Not done from the mockup: the 2x2 folder tile. Also not verified end to end:
Connect against a live Claude Code session and alongside Orca (does Orca rewrite
`statusLine`?), the pinned-app launch, and the new panels in the real window
(checked in headless Edge with stubbed data only).

## Update (2026-11-04, latest): Lumabar-style pill
The user asked for Shelf to follow Lumabar's bar and widget design for this
private tool, replacing both the "original design" note at the top and the
full-width bar above. The look is rebuilt in CSS/SVG; no Lumabar images or code are
used, and it should stay private. Default bar: [Net revenue][Claude][Start, apps]
[GitHub grid][chevron][Clock & Weather]. The chevron isn't in the reference, but
it's the only route to Settings and Quit while the tray is hidden.
- The window resizes to the bar (`set_dock_width`); the appbar reservation stays full width.
- Tiles laid out from the top need column flex, because `<button>` centers block content.
- Connect has now worked against a live Claude Code session, alongside Orca.

Not built: live wallpaper refraction ("bends your wallpaper"), and the 2x2 folder tile.
Not tested with real data: Stripe chart, GitHub tile (needs a username). The extra
tiles have only been rendered in headless Edge with sample data.

## Known limitations / ideas for later
- Appbar doesn't yet handle `ABN_POSCHANGED` / display changes (monitor plug/unplug,
  DPI change) — re-run placement on `ScaleFactorChanged` / monitor change.
- No single-instance guard (a second launch would create a second dock).
- API keys live in localStorage in plain text — fine for a personal app.

## Safety when testing
If the app crashes while the taskbar is hidden: run `shelf.exe --restore-taskbar`
(once implemented), or restart Windows Explorer from Task Manager.
