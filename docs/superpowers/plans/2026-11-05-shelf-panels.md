# Shelf panels: own Sound, Wi-Fi, Quick Settings and Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The owner asked for no subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Windows panels Shelf opens at fixed screen positions with Shelf's own cards, opening directly over their tile in Shelf's style, and give Claude a way to see and iterate on the result without disturbing the owner.

**Architecture:** A visual bench renders real UI with fake data in headless Edge, and a preview mode runs the real app beside the owner's Shelf. Each panel is a card in the existing shared card window, opened from a tile part. Windows access stays in Rust behind typed commands, one module per area, and every panel falls back to a link into Windows Settings for what it can't do.

**Tech Stack:** Existing Tauri 2, Rust, React 19, TypeScript, Zustand, Vitest. Adds `pixelmatch` and `pngjs` as dev dependencies only.

**Spec:** The owner's decision of 2026-11-05 is the requirement: the Windows panels don't sit with the dock, so Shelf gets its own (option C). `docs/lumabar/08-cards-and-interactions.md` for card behaviour, `docs/lumabar/widgets/media-and-audio.md` and `system.md` for Sound and Quick Toggles, `docs/lumabar/03-design-system.md` for tokens, `docs/lumabar/12-gaps.md` for owner changes.

## Scope

| In | Out, for now |
|---|---|
| Visual bench and preview mode | Tray icons (their own plan) |
| Sound, Wi-Fi, Quick Settings, Search cards | Keyboard shortcuts: Win+A, Win+S and Win+N still open Windows' panels. Taking them over needs a system-wide keyboard hook, which is a separate risk |
| Scroll on the Sound icon for volume | Start menu: stays native |
| | Notifications: stay native unless Task 3 finds the API usable, in which case a follow-up plan builds the card |

## Global Constraints

- **No scripted OS mouse.** Pointer events inside Shelf's own pages through the debug port are fine.
- **Warn the owner before any run that hides the taskbar, opens windows or takes focus,** and confirm the taskbar is back afterwards.
- **Never run a scripted Wi-Fi disconnect, connect or radio change on the owner's PC.** It can cut their connection and this session. Those actions are tested against fakes, and go on the manual list.
- **Preview mode refuses every command that changes the machine,** returning `Err("preview")`.
- **Never kill processes by broad name** such as `node.exe`. Stop only what the session started.
- **Wi-Fi passwords** go only into `WlanSetProfile`. They are never stored by Shelf, logged, cached or sent to a window event.
- **Commands that create windows are `#[tauri::command(async)]`,** and menu handlers spawn a thread for it. Doing otherwise deadlocks WebView2 on Windows.
- **Panel text is English,** like the rest of Shelf. Windows' own menus stay in Windows' language.
- **Design values come from tokens:** card radius `22px`, inner radius `10px`, fill `--card`, slide 8 px over 200 ms. Card width `340px`, except Search at `560px`.
- **Never claim a visual result without measuring or viewing it.** A CSS mistake once shipped behind a green suite and a false "verified". Never run the bench's `--update` for a scene without viewing the new picture.
- **The owner's Shelf locks `target/release/shelf.exe` while it runs.** Day-to-day preview runs use a debug build (`target/debug`, with Vite on port 5173), so they never disturb it. A release build happens only at an owner checkpoint: warn, `--quit`, build (about 5 minutes, with the Windows taskbar back meanwhile), relaunch.
- **Tooling:** the Bash tool collapses `\\`, so use the Write tool for anything with backslashes. Files may have CRLF endings after a checkout, so normalise before multi-line replacements.
- **Owner checkpoints:** after each of Tasks 5, 6, 7 and 8, leave a release build running, say what to try, and wait for the owner's verdict before the next panel. Their eye has found what tests didn't at every step so far.
- **Commits** go on branch `panels`, each ending with the session's attribution line. No merge to `main` without the owner's word.

## Review Focus

1. **No Wi-Fi adapter, no sound device, or a headset unplugged while the card is open:** the card shows a plain state and keeps working. Tests in Tasks 5 and 6.
2. **A wrong password or a dropped connection:** a plain error on that network's row, and no saved profile left behind. Test in Task 6.
3. **A poll arriving mid-drag:** the slider doesn't jump back under the pointer. Test in Task 5.
4. **SSIDs with accents, emoji, XML characters or no name:** shown correctly, connectable, or plainly unsupported. Test in Task 6.
5. **Fast typing, or a slow file search:** older results never replace newer ones, and the box never freezes. Test in Task 8.
6. **A card closed by clicking away:** it stops polling and scanning, and a typed password is gone. Test in Task 4.
7. **Clicking away while Wi-Fi is still connecting:** the attempt finishes, and reopening the card shows how it went. Test in Task 6.

---

### Task 0: Save the current work

**Files:** none new.

- [ ] **Step 1:** On `fix/dock-feedback`, run `npm test`, `cargo test --lib` in `src-tauri` and `npx tsc --noEmit`. Expected: all pass.
- [ ] **Step 2:** Commit everything as `fix: floating dock, focus mark, spacing, Windows menus and status tile`.
- [ ] **Step 3:** `git switch -c panels`. Nothing merges or is pushed.

### Task 1: Visual bench

**Files:**
- Create: `src/windows/bench/BenchWindow.tsx`, `src/windows/bench/scenes.tsx`, `src/windows/bench/fixtures.ts`, `src/test/bench/run.mjs`, `src/test/bench/compare.mjs` with `compare.d.mts` (`tsc` covers `src`, and needs the types to import it), `src/test/bench/compare.test.ts`, `src/test/baselines/`
- Modify: `src/core/tauri.ts`, `src/main.tsx`, `.gitignore`, `package.json`, `README.md`
- Move: the scene painting from `src/windows/gallery/GlassBench.tsx` into `scenes.tsx`, then delete `GlassBench.tsx` and the gallery's `glass` route
- Test: `src/core/tauri.test.ts`, `src/windows/bench/BenchWindow.test.tsx`

**Interfaces:**
- Produces:

```ts
// core/tauri.ts: when installed, invoke and listen use these instead of Tauri
export function installFakeBackend(handlers: Record<string, (args: any) => unknown>): void;

// windows/bench/scenes.tsx
export interface Scene {
  id: string;
  size: [number, number];
  wallpaper: "glow" | "ribbons" | "pale";
  theme: "dark" | "light";
  dock?: string[];            // widget ids, drawn in a real bar with the real shader
  card?: string;              // card id, drawn above the bar
  backend: Record<string, (args: any) => unknown>;
  steps?: { hover?: string; click?: string }[]; // selectors, run through the debug port
  measure?: { name: string; expect: string }[]; // JavaScript run in the page; each must be true
  scale?: number;             // display scale, default 1.25 as on the owner's PC
}
export const scenes: Scene[];
```

- `?w=bench&scene=<id>` renders one scene. `node src/test/bench/run.mjs [--scene <id>] [--update]` writes `.bench/<id>.png` and `.bench/<id>.diff.png`, prints each scene's changed pixels, and exits non-zero above **50 changed pixels**. A percentage would hide real changes, as the dock is only 2.5% of a full-screen frame. Pixelmatch's anti-aliasing tolerance absorbs rendering noise.
- `measure` exists because baselines only prove nothing changed, and `--update` can bless a bug. The spacing bug was a measurement away.
- The fake backend also serves events: `listen` works, a `glass_start` handler can fire `glass-frame`, and `glass_frame` returns the scene's wallpaper cropped to the bar in the real frame format. So scenes run the real `GlassLayer`, not a copy of it.

- [ ] **Step 1: Write failing tests**

```ts
it("invoke uses the fake backend when one is installed", async () => {});
it("invoke still rejects outside Tauri with no fake installed", async () => {});
it("a fake backend's missing command rejects with its name", async () => {});
it("identical images have 0 changed pixels", () => {});
it("one changed block of 100 pixels fails the check", () => {});
it("images of different sizes count as fully different", () => {});
it("an unknown scene says so instead of rendering blank", () => {});
it("Date.now is frozen in a scene, so clocks and countdowns render the same every time", () => {});
it("main.tsx reaches the bench only through a dynamic import", () => { /* reads the source: no static import of windows/bench */ });
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL, modules missing.
- [ ] **Step 3: Implement.** `run.mjs` builds with Vite, serves with `vite preview`, starts its own headless Edge with `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --remote-debugging-port=9444` and a throwaway profile, and drives it over a WebSocket. It emulates the scene's size and scale with `Emulation.setDeviceMetricsOverride`, including the screen size: headless Edge otherwise reports a tiny screen, and the dock limits itself to `window.screen.width`. It also fixes the timezone and language. `BenchWindow` sets `document.documentElement.dataset.bench` before first paint, under which `tokens.css` stops all animation and transitions. Scenes force the Inter font, and their `store_load` returns fixed settings, as the 24-hour default otherwise follows the locale. The bench installs its fake backend and freezes `Date.now` before `syncSettings` runs in `main.tsx`, since 13 source files read the clock and the first settings load calls `invoke`. Ignore `.bench/`.
- [ ] **Step 4: Add first scenes:** `dock-default`, `dock-light`, `dock-focus`, `dock-apps-many` (overflow), `card-claude`, `card-date`, `menu`, `picker`, `settings-dock`. Picker and settings render their real components. `dock-focus` measures that apps are at least 0.9T apart and that the focus plate is wider than the icon. `dock-apps-many` measures that the bar doesn't exceed the screen.
- [ ] **Step 5: Verify.** `run.mjs --update`, then `run.mjs` twice. Expected: 0 changed pixels in each scene, and no window appears on the owner's screen. Temporarily change `--T` spacing and confirm it fails, then revert. Read each PNG yourself.
- [ ] **Step 6: Commit** `feat: visual test bench`.

### Task 2: Preview mode

**Files:**
- Create: `src-tauri/src/preview.rs`, `src/test/see.mjs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/src/store.rs`, `src-tauri/src/shell/mod.rs`, `src-tauri/src/shell/dock.rs`, `src-tauri/src/shell/taskbar.rs`, `src-tauri/src/apps/mod.rs`, `src-tauri/src/system/mod.rs`, `src-tauri/src/system/status.rs`, `README.md`

**Interfaces:**
- Produces: `shelf.exe --preview`; Rust `preview::is_on() -> bool`, `preview::guard() -> Result<(), String>` returning `Err("preview")`, and pure `preview::startup(on: bool) -> Startup { touch_taskbar: bool, reserve_edge: bool, watchdog: bool, mutex: &str, quit_event: &str, data_folder: &str }`.
- `node src/test/see.mjs <out.png>` connects on port 9333, captures the screen, draws each visible Shelf window's page over it at its real position, and saves one full-screen picture including native windows.

- [ ] **Step 1: Write failing tests**

```rust
#[test] fn preview_leaves_the_taskbar_and_screen_edge_alone() {}
#[test] fn preview_has_its_own_lock_quit_event_and_data_folder() {}
#[test] fn normal_startup_is_unchanged() {}
#[test] fn guard_refuses_only_in_preview() {}
#[test] fn preview_has_its_own_webview_folder() {}
#[test] fn quitting_or_crashing_in_preview_never_touches_the_taskbar() {}
#[test] fn preview_starts_from_a_copy_of_the_owners_layout_and_settings() {}
```

- [ ] **Step 2: Run** `cargo test --lib preview`. Expected: FAIL.
- [ ] **Step 3: Implement** with a process-wide flag set first in `run()`. Preview data lives in `%APPDATA%\Shelf-preview`, and the dock floats. `--quit --preview` closes only the preview. Set `WEBVIEW2_USER_DATA_FOLDER` to a preview folder before Tauri starts: otherwise it shares `%LOCALAPPDATA%\dev.personal.shelf\EBWebView` with the owner's Shelf, and WebView2 refuses a second instance with different arguments such as the debug port. `shell::dock::stop` and the panic hook call `TASKBAR.restore()`, which always shows the taskbar's windows, so both must skip it in preview: otherwise closing the preview brings the taskbar back over the owner's Shelf. On start, copy `layout.json` and `settings.json` into the preview folder, so pictures match what the owner sees. Keys aren't copied.
- [ ] **Step 3b: Guard what already changes the machine:** `set_taskbar_mode`, `autostart_set`, `claude_connect` (it rewrites Claude Code's settings), `apps_activate`, `apps_context_menu`, `start_menu`, `start_quick_menu` and `shell_panel`. Secrets and the store stay usable, as they follow the preview's data folder. Add one test per command group.
- [ ] **Step 3c: Make `see.mjs` honest.** Set `Emulation.setDefaultBackgroundColorOverride` to transparent before capturing a page, or its transparent corners come back white. Convert positions with the window's scale. Add `src/test/preview.sh`, which builds debug, starts its own Vite, runs the preview with the debug port, and stops only what it started.
- [ ] **Step 4: Verify on the PC.** Warn the owner. With their Shelf running, run the preview, run `see.mjs`, then quit the preview. Expected: their Shelf and taskbar state are unchanged per `probe.ps1`, and the picture shows the dock with the desktop behind it. The preview's dock sits on top of theirs while it runs, so it's visible to the owner for that time. View the picture.
- [ ] **Step 5: Commit** `feat: preview mode and full-screen pictures`.

### Task 3: API spike (gate)

**Files:**
- Create: `docs/lumabar/16-panels-spike.md`; throwaway `#[ignore]` tests, deleted before the commit.
- Modify: `src-tauri/Cargo.toml`: the features the probes need (`Devices_Radios`, `Win32_System_Wmi`, `Win32_Devices_Display`, `UI_Notifications_Management`). Keep those a later task uses, and remove the rest.

Every probe reads only. Nothing changes a setting.

- [ ] **Step 1: Probe each, on this PC, from an unpackaged process, and record the result:**

| Probe | API | Decides |
|---|---|---|
| App volumes | `IAudioSessionManager2`, `IAudioSessionControl2`, `ISimpleAudioVolume` | Sound card's app list |
| Outputs | `EnumAudioEndpoints` for the list | Sound card's device list |
| Network list | `WlanGetAvailableNetworkList` | Wi-Fi card |
| Radios | `GetRadiosAsync` and `State`. Not `RequestAccessAsync` until the owner has been warned it may prompt | Wi-Fi and Bluetooth switches |
| Brightness | WMI `WmiMonitorBrightness` read, `GetMonitorBrightness`. Laptop panels usually answer only to WMI, so record whether a set can be done from Rust without actually doing it | Brightness slider |
| Apps | Enumerate `FOLDERID_AppsFolder` | Search |
| Files | `ISearchFolderItemFactory` | Search |
| Notifications | `UserNotificationListener::GetAccessStatus` only, as `RequestAccessAsync` can raise a consent prompt | Whether a notifications card is possible at all |
| Location | Whether the network list works or is refused for lack of location permission, which recent Windows 11 versions may require of Wi-Fi APIs. Unconfirmed, so measure it | Task 6's permission state |

- [ ] **Step 2: Rule on what isn't public.** Switching the default output has no public API: `IPolicyConfig` isn't in the `windows` crate. Airplane mode, Do not disturb and Night light are also undocumented. For each, write **Build** or **Link to Settings** in the spike doc. Default to the link, except `IPolicyConfig`, which is widely used and declared by hand in Task 5 if the read-only list works.
- [ ] **Step 3: Gate.** If the Sound session list or the Wi-Fi network list can't be read, **stop and ask the owner.** Anything else falls back to a Settings link and continues.
- [ ] **Step 4: Commit** `docs: what the panels can and can't do on Windows`.

### Task 4: Panel foundation

**Files:**
- Create: `src/panels/index.ts`, `src/design/parts/Slider.tsx`, `src/design/parts/Switch.tsx`, `src/design/parts/SettingsLink.tsx`, `src-tauri/src/system/settings_link.rs`
- Modify: `src/windows/card/CardWindow.tsx`, `src-tauri/src/shell/card.rs`, `src-tauri/src/system/mod.rs`, `src-tauri/src/lib.rs`, `src/widgets/system-status/index.tsx`, `src/windows/settings/controls.tsx` (use the shared `Switch`), `src/windows/bench/scenes.tsx`
- Test: `src/panels/panels.test.tsx`, `src/design/parts/Slider.test.tsx`, Rust tests in `settings_link.rs`

**Interfaces:**
- Produces:

```ts
export type PanelId = "sound" | "wifi" | "quick" | "search";
export interface PanelDef { Card: React.FC; width: number }
export const panels: Partial<Record<PanelId, PanelDef>>; // each task adds its own; Task 9 checks all four
export function openPanel(id: PanelId, anchor: HTMLElement): void; // open_card with widgetId `__panel:${id}`, or shell_panel while unbuilt
export function goToPanel(id: PanelId): void; // from inside a card: same place, different panel
<Slider value={number} label={string} onChange={(v: number) => void} />   // holds its own value while dragged
<Switch label={string} on={boolean} onFlip={() => void} />
<SettingsLink page={string} label={string} />
```

- Rust: `swap_card(widget_id: String, width: f64) -> Result<(), String>` updates what's open, so a tile click still toggles the right card, and refits over the same tile. `open_settings(page: String) -> Result<(), String>`, passing `preview::guard()` and accepting only an allow-list: `sound`, `network-wifi`, `bluetooth`, `display`, `batterysaver`, `nightlight`, `quiethours`, `privacy-location`.
- Event `card-closed`, emitted to the card window whenever the card hides by any route. The page then unmounts what it shows. Today nothing does: a closed card stays mounted, keeps its providers running and keeps its inputs' contents.
- A card's body scrolls past `min(640px, screen height minus the dock)`, so long lists don't reach the top of the screen.

- [ ] **Step 1: Write failing tests**

```ts
it("the card window shows a panel for a __panel: id", () => {});
it("openPanel centres the card on the part that was clicked", () => {});
it("a panel not built yet still opens Windows' own", () => {});
it("the slider follows the pointer and ignores new values until released", () => {});
it("the slider clamps to 0-100", () => {});
it("the slider moves with the arrow keys", () => {});
it("closing a card unmounts it, so its providers stop", () => {});
it("closing a card clears what was typed in it", () => {});
it("reopening a card starts it fresh", () => {});
it("goToPanel swaps the card without moving it", () => {});
it("a change made in a card refreshes the dock's status tile", () => { /* refresh(statusProvider) reaches the other window */ });
```
```rust
#[test] fn only_known_settings_pages_open() {}
#[test] fn a_page_cannot_smuggle_in_another_uri() {}
#[test] fn after_a_swap_the_same_tile_closes_the_new_card() {}
#[test] fn every_way_of_closing_announces_it() {}
```

- [ ] **Step 2: Run** both suites. Expected: FAIL.
- [ ] **Step 3: Implement.** The status tile opens panels through `openPanel`, with the bell still calling `shell_panel` for notifications. Until a panel exists it maps to `shell_panel`, so nothing regresses between tasks.
- [ ] **Step 4: Run** both suites. Expected: PASS. Bench: unchanged scenes pass.
- [ ] **Step 5: Verify keyboard focus for real.** Search and Wi-Fi passwords depend on it, the dock no longer takes focus, and neither jsdom nor debug-port clicks can prove it. Warn the owner. Open a card from the running release, then check with `menu-look.ps1` that the foreground window is Shelf's card. Ask the owner to confirm with a real click and by typing in the date card's city field, which is an open item from the last round. **If typing fails, fix this before Task 5.**
- [ ] **Step 6: Commit** `feat: panel foundation`.

### Task 5: Sound card

**Files:**
- Create: `src-tauri/src/system/audio.rs`, `src/panels/sound/{SoundCard.tsx,sound.css}`, `src/panels/sound/sound.test.tsx`, `src/widgets/_providers/audio.ts`
- Modify: `src-tauri/src/system/status.rs`, `src-tauri/src/system/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src/widgets/system-status/index.tsx`, `src/panels/index.ts`, `src/windows/bench/fixtures.ts`, `src/windows/bench/scenes.tsx`

**Interfaces:**
- Produces, all `#[tauri::command(async)]`, with writes passing `preview::guard()`:

```rust
audio_state() -> AudioState { volume: u32, muted: bool, device: Option<String>, devices: Vec<AudioDevice { id, name, active }>, apps: Vec<AudioApp { pid, name, volume, muted }> }
audio_set_volume(percent: u32) -> Result<(), String>
audio_set_mute(muted: bool) -> Result<(), String>
audio_set_app_volume(pid: u32, percent: u32) -> Result<(), String>
audio_set_output(id: String) -> Result<(), String>
```

- `audioProvider`, polling every 2000 ms and only while subscribed.

- [ ] **Step 1: Write failing tests**

```rust
#[test] fn percent_is_clamped_both_ways() {}
#[test] fn sessions_of_one_process_merge() {}
#[test] fn a_session_with_no_name_uses_its_program_name() {}
#[test] fn expired_sessions_are_left_out() {}
```
```ts
it("shows volume, each app's volume and the outputs", () => {});
it("the master slider sets the volume", () => {});
it("a poll arriving mid-drag doesn't move the slider", () => {});
it("the speaker icon mutes and unmutes", () => {});
it("choosing an output marks it", () => {});
it("no sound device shows a plain message and a Settings link", () => {});
it("a device unplugged while open drops from the list without breaking", () => {});
it("scrolling on the Sound icon changes the volume by 2", () => {});
it("scrolling doesn't go past 0 or 100", () => {});
```

- [ ] **Step 2: Run** both suites. Expected: FAIL.
- [ ] **Step 3: Implement.** Hand-declare `IPolicyConfig` only per the Task 3 ruling; otherwise the output list links to Settings. Coalesce slider writes to at most one every 40 ms. Tile: the speaker glyph updates at once through `refresh(statusProvider)`, as the card and the dock are separate windows.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Bench.** Scenes `card-sound`, `card-sound-muted`, `card-sound-no-device`, `card-sound-many-apps`. View each beside `audio-output-dark` for colour and slider style. Iterate until right, then `--update`.
- [ ] **Step 6: Verify live.** Warn the owner: their volume will move slightly and be put back. Preview refuses writes, so this runs in a throwaway `#[ignore]` Rust test, deleted afterwards: read the volume, set it 2% lower, read it, restore it, read it again. Separately, picture the card with `see.mjs` in preview.
- [ ] **Step 7: Commit** `feat: Shelf's own Sound card`, then run the owner checkpoint.

### Task 6: Wi-Fi card

**Files:**
- Create: `src-tauri/src/system/wifi.rs`, `src/panels/wifi/{WifiCard.tsx,wifi.css}`, `src/panels/wifi/wifi.test.tsx`, `src/widgets/_providers/wifi.ts`
- Modify: `src-tauri/src/system/status.rs`, `src-tauri/src/system/mod.rs`, `src-tauri/src/lib.rs`, `src/panels/index.ts`, bench files

**Interfaces:**
- Produces, writes passing `preview::guard()`:

```rust
wifi_networks() -> WifiList { adapter: bool, on: bool, permission: bool, attempt: Option<Attempt { id, state: "connecting" | "failed", error: Option<String> }>, networks: Vec<Network { id, name, signal, auth, saved, connected }> }
wifi_scan() -> Result<(), String>
wifi_connect(id: String, password: Option<String>) -> Result<(), String> // returns at once; progress comes through `attempt`
wifi_disconnect() -> Result<(), String>
// pure, tested
enum Auth { Open, Wpa2, Wpa3, Enterprise, Other }
struct RawNetwork { ssid: Vec<u8>, signal: u32, auth: Auth, profile: Option<String>, connected: bool } // connecting uses the profile's name, which can differ from the SSID
fn network_id(ssid: &[u8]) -> String // the SSID's bytes in hex: names need not be valid text, and the id must survive to connect
fn profile_xml(ssid: &[u8], auth: Auth, password: Option<&str>) -> String
fn merge_networks(raw: Vec<RawNetwork>) -> Vec<Network>
fn password_problem(password: &str) -> Option<&'static str>
```

- [ ] **Step 1: Write failing tests**

```rust
#[test] fn profile_escapes_xml_in_password_and_name() { /* a&b<c>"d'e */ }
#[test] fn profile_uses_the_hex_ssid_so_any_bytes_survive() {}
#[test] fn profile_covers_open_wpa2_and_wpa3() {}
#[test] fn networks_merge_by_name_keeping_the_strongest() {}
#[test] fn connected_comes_first_then_saved_then_by_signal() {}
#[test] fn accents_and_emoji_in_names_survive() {}
#[test] fn hidden_networks_are_left_out() {}
#[test] fn enterprise_networks_are_marked_for_settings() {}
#[test] fn passwords_must_be_8_to_63_characters() {}
#[test] fn a_failed_new_connection_removes_its_profile() {} // against a Wlan trait fake
#[test] fn a_saved_network_connects_by_its_profile_name_without_changing_it() {}
#[test] fn a_name_that_is_not_valid_text_can_still_be_connected() {}
#[test] fn the_attempt_outlives_the_card_and_never_holds_the_password() {}
```
```ts
it("lists networks with signal, lock and connected state", () => {});
it("a saved network connects on click", () => {});
it("a new secured one asks for its password in the row", () => {});
it("the password never appears once submitted", () => {});
it("the password is sent only to wifi_connect", () => {});
it("a wrong password shows a plain error on that row", () => {});
it("disconnecting needs a second click", () => {});
it("no adapter shows a plain message", () => {});
it("Wi-Fi off shows how to turn it on", () => {});
it("refused location permission explains it and links to that setting", () => {});
it("reopening during a connection shows it still connecting", () => {});
it("the list refreshes while open and doesn't move the row being typed in", () => {});
```

- [ ] **Step 2: Run** both suites. Expected: FAIL.
- [ ] **Step 3: Implement.** The Windows calls sit behind a `Wlan` trait, so tests never touch the real adapter. Wait up to 20 s for the result through `WlanRegisterNotification`. Enterprise networks and captive portals link to Settings. A scan on opening the card and every 10 s while mounted, which `card-closed` from Task 4 ends. The password stays in `wifi_connect`'s call and is dropped as soon as the profile is set.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Bench.** Scenes `card-wifi`, `card-wifi-password`, `card-wifi-wrong-password`, `card-wifi-no-adapter`, `card-wifi-off`. View each and iterate.
- [ ] **Step 6: Verify live, read-only.** Warn the owner. In preview, open the card and picture it: real networks, with the connected one first. **No connect or disconnect.** Add real connect, wrong password, disconnect and reconnect to `docs/manual-checks.md`.
- [ ] **Step 7: Commit** `feat: Shelf's own Wi-Fi card`, then run the owner checkpoint.

### Task 7: Quick Settings card

**Files:**
- Create: `src-tauri/src/system/radios.rs`, `src-tauri/src/system/brightness.rs`, `src/panels/quick/{QuickCard.tsx,quick.css}`, `src/panels/quick/quick.test.tsx`, `src/widgets/_providers/quick.ts`
- Modify: `src-tauri/src/system/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src/panels/index.ts`, bench files

**Interfaces:**
- Produces, subject to the Task 3 rulings, with writes passing `preview::guard()`:

```rust
radios_state() -> Vec<RadioInfo { kind: "wifi" | "bluetooth", on: bool }>
radio_set(kind: String, on: bool) -> Result<(), String>
brightness_get() -> Option<u32>
brightness_set(percent: u32) -> Result<(), String>
```

- [ ] **Step 1: Write failing tests**

```ts
it("shows Wi-Fi and Bluetooth with their state", () => {});
it("the chevron on Wi-Fi moves to the Wi-Fi card", () => {});
it("Bluetooth's chevron opens Windows' Bluetooth settings", () => {});
it("a switch that fails goes back and says why", () => {});
it("shows brightness and volume sliders", () => {});
it("no adjustable brightness hides that slider", () => {});
it("a machine with no battery hides that row", () => {});
it("what can't be built links to Settings and is never shown as a dead switch", () => {});
```
```rust
#[test] fn only_known_radios_can_be_set() {}
#[test] fn brightness_is_clamped() {}
```

- [ ] **Step 2: Run** both suites. Expected: FAIL.
- [ ] **Step 3: Implement** in the Quick Toggles style (`quick-toggles-dark`): pills with a divider and chevron. Share the volume row with Sound.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Bench.** Scenes `card-quick`, `card-quick-desktop`, `card-quick-radio-error`. View each beside `quick-toggles-dark` and iterate.
- [ ] **Step 6: Verify live, read-only.** Warn the owner. Picture the card in preview with real states. Add real radio and brightness changes to `docs/manual-checks.md`.
- [ ] **Step 7: Commit** `feat: Shelf's own Quick Settings card`, then run the owner checkpoint.

### Task 8: Search

**Files:**
- Create: `src-tauri/src/search/{mod.rs,apps.rs,files.rs}`, `src/panels/search/{SearchCard.tsx,rank.ts,search.css}`, `src/panels/search/search.test.tsx`, `src/panels/search/rank.test.ts`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src/widgets/apps/Tile.tsx`, `src/panels/index.ts`, bench files

**Interfaces:**
- Produces:

```rust
search_apps() -> Vec<SearchItem { id, name, kind: "app" }>     // cached, refreshed on opening
search_files(query: String, ticket: u64) -> Vec<SearchItem>    // kind: "file"; off the UI thread
search_open(id: String) -> Result<(), String>                  // only ids returned by the calls above
search_web(query: String) -> Result<(), String>                // builds the URL in Rust and encodes the text; the page can't open arbitrary addresses
search_icon(id: String) -> Option<String>
```
```ts
export function rank(query: string, items: Item[], history: Record<string, number>): Item[];
```

- [ ] **Step 1: Write failing tests**

```ts
it("a name's start beats a word's start beats anywhere", () => {});
it("matching ignores case and accents", () => {});
it("what you open more often ranks higher", () => {});
it("an empty query shows recent items, then nothing", () => {});
it("the box has focus as soon as the card opens", () => {});
it("arrows move the selection and Enter opens it", () => {});
it("Escape closes the card", () => {});
it("the last row searches the web for the text", () => {}); // https://www.google.com/search?q=<encoded>
it("file results from an older query never replace newer ones", () => {});
it("files are asked for only after a 150 ms pause in typing", () => {});
it("a failed file search still shows apps and the web row", () => {});
it("results render as text, never HTML", () => {});
it("the loupe opens this card, not Windows' search", () => {});
```
```rust
#[test] fn only_ids_it_returned_can_be_opened() {}
#[test] fn a_new_ticket_makes_older_searches_stop() {}
```

- [ ] **Step 2: Run** both suites. Expected: FAIL.
- [ ] **Step 3: Implement.** Apps from `FOLDERID_AppsFolder`, files from `ISearchFolderItemFactory`, per the Task 3 rulings. If files aren't usable, ship apps and web only and say so. History goes through `store_save("search-history", ...)`, with names only.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Bench.** Scenes `card-search-empty`, `card-search-results`, `card-search-no-results`, `card-search-long-names`. View each and iterate.
- [ ] **Step 6: Verify live.** Warn the owner. In preview, type through the debug port, picture the result, and confirm real apps appear. Time the first results. Expected: under 150 ms for apps. `search_open` and `search_web` launch things, so they pass `preview::guard()` and go on the manual list. Start's lit state still follows `SearchHost`, which Win+S opens, so check that it doesn't light up when Shelf's own search is open.
- [ ] **Step 7: Commit** `feat: Shelf's own search`, then run the owner checkpoint.

### Task 9: Finish

**Files:**
- Modify: `src-tauri/src/system/status.rs`, `src/panels/index.ts`, `src/widgets/system-status/index.tsx`, `src/test/cdp-check.mjs`, `src/test/measure.sh`, `docs/manual-checks.md`, `docs/lumabar/12-gaps.md`, `README.md`, `HANDOFF.md`

- [ ] **Step 1: Remove what's replaced.** `shell_panel` keeps only `notifications`, and the unbuilt-panel fallback goes. Update the tests, including `panel_for("sound") == None`, and a test that all four panels exist.
- [ ] **Step 2: Extend `cdp-check.mjs`:** each tile part opens its card, centred on that part within 8 px and fully on screen, and the card closes with Escape.
- [ ] **Step 3: Measure.** Warn the owner. `measure.sh` with each card closed, and at rest with the Sound card open. Expected: under 0.5% at rest with cards closed, under 300 MB. The earlier 0.89% predates the status tile, so measure with and without that tile and with and without charging. Fix what's over the target.
- [ ] **Step 4: Run everything.** `npm test`, `cargo test --lib`, `npm run build`, `run.mjs`, `e2e.sh`. Expected: all pass, taskbar restored.
- [ ] **Step 5: Look at every screen.** Rebuild, leave the release running for the owner, and picture the dock with each card open with `see.mjs`. Report anything not viewed.
- [ ] **Step 6: Write the manual list,** clearly separating what only real clicks and real networks can prove.
- [ ] **Step 7: Commit** `chore: complete Shelf's panels`. Then self-review the branch, as the owner asked for no subagents, and report rulings, deferred minors and anything not verified.
