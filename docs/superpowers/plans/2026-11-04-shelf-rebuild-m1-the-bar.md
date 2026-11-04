# Shelf rebuild, Milestone 1: the bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Shelf with a clean foundation and a real, daily-usable glass pill matching the reference's look: apps, Claude limits, GitHub activity, revenue, and Clock & Weather, with picker, cards and Settings.

**Architecture:** Tauri 2 with Rust for everything Windows-specific, and React for all UI. Each widget is one self-contained folder found by a registry. Tiles only draw what a provider gives them, and all design values come from tokens scaled from one tile height.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Vite, Zustand, dnd-kit, Vitest, Testing Library, `@fontsource-variable/inter`.

**Spec:** `docs/lumabar/README.md`, chiefly `03-design-system.md`, `04-glass.md`, `06-widget-management.md`, `07-settings.md`, `08-cards-and-interactions.md`, `12-gaps.md` (decisions), `13-architecture.md`, `14-tech-stack.md`, and the `widgets/` entries.

## Milestones

| # | Delivers | Plan |
| --- | --- | --- |
| **M1** | Foundation, glass, Black style, apps basics, picker, cards, Settings, 11 widgets | This file |
| M2 | Taskbar's full job: previews, jump lists, Tray, Language, Quick Toggles, Audio Output, Now Playing, all styles, top edge, auto-hide, displays | Written after M1 |
| M3 | Screen Time, Calendar, Pomodoro and the rest of the everyday widgets | Later |
| M4 | Remaining catalogue and integrations | Later |
| M5 | Automations, unified calendar, extras from G-14 | Later |

Priority change from `15-feature-checklist.md`: the P1 widgets Tray, Quick Toggles, Now Playing, Audio Output, Screen Time and Calendar move to M2 and M3, so M1 ships sooner. F-029 to F-032 other than Liquid Glass and Black also move to M2.

## Global Constraints

- Private tool. Never publish or redistribute. No Lumabar images, code or name in the product; `docs/lumabar/_evidence/` stays git-ignored and is never imported by the app.
- Windows 11 and 10, 64-bit. No admin rights. Changes no Windows files.
- Never read `.credentials.json` or any Claude login token. Claude limits come only from the status line feed.
- No scripted mouse movement or clicks on the owner's PC while testing. Use unit tests, headless renders, window-state probes and screenshots. Anything needing real clicks goes in the owner's manual check list.
- Warn before any run that hides the taskbar. Quit cleanly, and verify the taskbar is back afterwards.
- Text from feeds and APIs renders as text, never as HTML.
- Sizes: `--T: 50px` at M, bar `55px` (T × 1.09, padding 0.04T), window height `72px` (17px gap below), tile radius `0.24T`, bar radius `0.28T`, gap `0.04T`, app icon `0.60T`.
- Material, dark: fill `#ffffff0e`, rim `#ffffff27`. Light: fill `#0000000b`, rim `#0000001a`.
- Colours: fg `#f5f5f7`/`#1c1c1e`, muted `#98989d`/`#6e6e73`, accent `#0a84ff`/`#007aff`, error `#ff453a`/`#d70015`, good `#30d158`/`#248a3d`, warn `#ff9f0a`/`#b25000`, card `#181818`/`#ffffff`, track `#ffffff1f`/`#0000001a`, card radius `22px`, menu radius `20px`, inner radius `10px`.
- Type per T: hero `.40`, large `.32`, value `.24`, label `.17` (semibold), secondary `.15` (muted), micro `.11`, letter-spacing `.01em`.
- Font: `"SF Pro Display", "Inter Variable", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`. Never bundle SF Pro.
- Resource targets: idle under 0.5% of machine CPU, glass moving under 3%, private memory under 300 MB, no drawing in fullscreen.
- Commits go on branch `rebuild`, each ending with the session's attribution line.

## Review Focus

1. **Shelf is killed or crashes while the taskbar is hidden:** next launch or `--restore-taskbar` restores the original setting. Test in Task 3.
2. **Explorer restarts, or the PC sleeps and resumes:** taskbar stays hidden and the appbar and position are re-asserted, with no empty strip. Test in Task 5.
3. **Corrupt or old saved layout, or a saved widget id that no longer exists:** app still starts and drops only the bad part. Tests in Tasks 3 and 4.
4. **Offline at startup, or a rejected key:** dock appears at once from cache, tile shows its last value as stale, and the card explains in plain words. Test in Task 6.
5. **More tiles than fit the screen, or a 150% scale display:** bar never exceeds the screen, apps shrink first, and text stays sharp. Tests in Tasks 5 and 8.

---

### Task 1: Clean start and scaffold

**Files:**
- Create: `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/windows/dock/DockWindow.tsx`, `src/test/setup.ts`
- Modify: `package.json`, `src-tauri/tauri.conf.json`, `.gitignore`
- Delete: `src/*.js`, `src/*.css`, `src/panel.html`, `src/index.html`

**Interfaces:**
- Produces: `npm test`, `npm run build`, `npm run dev`; one Vite entry that picks a window view from `?w=dock|card|picker|settings|toast`.

- [ ] **Step 1: Baseline.** `git add` everything except ignored files, commit as `chore: baseline before rebuild`, then `git switch -c rebuild`.
- [ ] **Step 2: Add dependencies.** `react`, `react-dom`, `zustand`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@fontsource-variable/inter`, and dev `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `jsdom`, `@testing-library/react`.
- [ ] **Step 3: Write failing test** `src/windows/dock/DockWindow.test.tsx`: `renders a bar` asserts an element with `data-testid="bar"` exists.
- [ ] **Step 4: Run** `npm test`. Expected: FAIL, module not found.
- [ ] **Step 5: Implement** the entry and minimal `DockWindow`. Point `tauri.conf.json` at `devUrl: http://localhost:5173`, `frontendDist: ../dist`, `beforeDevCommand: npm run vite`, and keep `additionalBrowserArgs` from today's config. Windows: `dock` only for now (`?w=dock`, transparent, undecorated, no shadow, skip taskbar, always on top, hidden at start, height 72).
- [ ] **Step 6: Verify.** `npm test` passes; `npm run build` succeeds; `cargo check` in `src-tauri` succeeds.
- [ ] **Step 7: Commit** `feat: scaffold React frontend`.

### Task 2: Design tokens and shared parts

**Files:**
- Create: `src/design/tokens.css`, `src/design/styles/black.css`, `src/design/styles/liquid.css`, `src/design/parts/{Tile,Ring,Bar,Sparkline,RoundButton,Row}.tsx`, `src/design/parts/parts.css`, `src/windows/gallery/Gallery.tsx`
- Modify: `docs/lumabar/_tools/token-check/run.py`
- Test: `src/design/parts/parts.test.tsx`

**Interfaces:**
- Produces:
  - `<Tile width={number} tone?="glass"|"solid" onClick? children />`, where `width` is in tile heights and sets `width: calc(var(--T) * width)`
  - `<Ring percent={number} color?={string} size={number}>children</Ring>`
  - `<Bar percent={number} level?="good"|"warn"|"full" thickness?={number} />`
  - `<Sparkline values={number[]} color={string} fill?={boolean} />`, tolerant of empty and flat input
  - `<RoundButton icon label color? onClick />`
  - `<Row label detail value />`
  - `setStyle(name: "liquid"|"black")`, `setTheme("dark"|"light")`, `setDockSize(t: number)`, in `src/design/theme.ts`
  - `?w=gallery` shows sample tiles for visual checks.

- [ ] **Step 1: Write failing tests:**

```tsx
it("Tile width scales from T", () => { /* style width is calc(var(--T) * 3.1) */ });
it("Ring clamps percent to 0–100", () => { /* percent 140 draws a full ring; -5 draws none */ });
it("Bar picks level from percent when none is given", () => { /* 41 good, 70 warn, 90 full */ });
it("Sparkline draws nothing for empty values and a flat line for equal ones", () => {});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** tokens from Global Constraints and the parts. Rim is a `1px` inset border. Import Inter from `@fontsource-variable/inter`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Point `token-check/run.py` at the gallery** with T set to 148 px, built from `dist`, with candidates `sf` (via locally available fonts only, otherwise skipped) and `inter`.
- [ ] **Step 6: Verify.** Date tile mean difference is at most 12 with Inter, and `_evidence/sheets/token-check.png` visually matches the reference column.
- [ ] **Step 7: Commit** `feat: design tokens and shared parts`.

### Task 3: Rust core: store, secrets, taskbar safety

**Files:**
- Create: `src-tauri/src/store.rs`, `src-tauri/src/secrets.rs`, `src-tauri/src/net.rs`, `src-tauri/src/shell/{mod,taskbar,appbar,events}.rs`, `src-tauri/src/apps/mod.rs`, `src-tauri/src/system/mod.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`
- Delete: `src-tauri/src/win.rs` (moved piece by piece; keep behaviour)
- Keep unchanged: `src-tauri/src/claude_usage.rs`

**Interfaces:**
- Produces Tauri commands:
  - `store_load(name: String) -> Option<Value>`, `store_save(name: String, value: Value) -> ()`
  - `secret_set(id: String, value: String)`, `secret_has(id: String) -> bool`, `secret_delete(id: String)`
  - `http_get(req: { url, headers, secret?: { id, header, prefix } }) -> { status, body }`, which fills the secret in Rust so keys never reach the page
  - `shell_status() -> { fullscreen: bool, locked: bool, hidden_taskbar: bool }`, and event `shell-changed`
  - `set_taskbar_mode(mode: "hidden"|"autohide")`
- Taskbar state file stays `%APPDATA%\Shelf\taskbar_state.txt`.

- [ ] **Step 1: Write failing Rust tests:**

```rust
#[test] fn store_round_trips_and_writes_atomically() {}
#[test] fn corrupt_store_file_loads_as_none_and_is_kept_as_bak() {}
#[test] fn store_rejects_names_with_path_separators() {}
#[test] fn secret_round_trips_through_dpapi_and_file_is_not_plaintext() {}
#[test] fn second_restore_does_not_change_autohide() {}
#[test] fn hide_does_not_overwrite_saved_state_after_a_crash() {}
```

Taskbar tests run against a `TaskbarApi` trait with a fake, so they never touch the real taskbar.

- [ ] **Step 2: Run** `cargo test --lib`. Expected: FAIL.
- [ ] **Step 3: Implement.** `store.rs` writes JSON under `%APPDATA%\Shelf\data` by temp file and rename. `secrets.rs` uses `CryptProtectData`, adding the `Win32_Security_Cryptography` feature. Move taskbar code behind `TaskbarApi`, keeping `--restore-taskbar`, the panic hook and locked re-hide. Keep `--claude-statusline` handling first in `run()`.
- [ ] **Step 4: Run** `cargo test --lib`. Expected: all pass, including `claude_usage` tests.
- [ ] **Step 5: Commit** `feat: Rust core with store, secrets and taskbar safety`.

### Task 4: Widget contract, registry and layout

**Files:**
- Create: `src/core/widget.ts`, `src/core/registry.ts`, `src/core/layout.ts`, `src/core/tauri.ts`, `src/widgets/_sample/index.tsx`
- Test: `src/core/registry.test.ts`, `src/core/layout.test.ts`

**Interfaces:**
- Produces:

```ts
export type Category = "clocks"|"productivity"|"system"|"apps-files"|"media-audio"|"ai"|"analytics"|"social"|"stocks"|"finance"|"weather"|"online-mail"|"developer";
export interface WidgetDef<D = unknown> {
  id: string; name: string; description: string; category: Category;
  width: number | ((data: D | null) => number);
  Tile: React.FC<TileProps<D>>;
  Card?: React.FC<TileProps<D>>;
  provider?: Provider<D>;
  sample?: D;
  menu?: (ctx: MenuCtx) => MenuItem[];
}
export interface TileProps<D> { data: D | null; status: Status; error?: ProviderError; preview?: boolean }
export function defineWidget<D>(def: WidgetDef<D>): WidgetDef<D>;
export const widgets: WidgetDef[];                // from import.meta.glob("../widgets/*/index.tsx", { eager: true })
export function byCategory(): Map<Category, WidgetDef[]>;
// layout store (Zustand)
useLayout: { ids: string[]; add(id): void; remove(id): void; move(from: number, to: number): void; load(): Promise<void> }
```

- [ ] **Step 1: Write failing tests:** registry finds `_sample` only in test mode; duplicate ids throw; `add` appends last (G-12) and ignores duplicates; `remove` and `move` update order; `load` drops ids not in the registry and keeps the rest; a corrupt store yields the default layout (G-16: `claude-plan-usage`, `apps`, `github-activity`, `clock-and-weather`); every change saves through `store_save` with `version: 1`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified. `src/core/tauri.ts` is the only file importing `@tauri-apps/api`, so tests can mock it.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: widget contract, registry and layout store`.

### Task 5: The dock window

**Files:**
- Create: `src/windows/dock/Bar.tsx`, `src/windows/dock/dock.css`, `src-tauri/src/shell/dock.rs`
- Modify: `src/windows/dock/DockWindow.tsx`, `src-tauri/src/lib.rs`, `src-tauri/src/shell/events.rs`
- Test: `src/windows/dock/Bar.test.tsx`, Rust tests in `shell/dock.rs`

**Interfaces:**
- Consumes: `useLayout`, `widgets`, `Tile`, `shell_status`.
- Produces: `set_dock_width(width: f64)`; pure `dock_rect(monitor: Rect, scale: f64, logical_width: f64, height: f64) -> Rect`; `open_tile_menu` hook point for Task 8; `data-widget-id` on each tile's wrapper.

- [ ] **Step 1: Write failing tests:**

```rust
#[test] fn dock_is_centred_on_monitor() {}
#[test] fn dock_never_exceeds_monitor_width() {}
#[test] fn dock_rect_is_correct_at_100_125_150_percent() {}
#[test] fn monitor_with_offset_origin_is_respected() {}
#[test] fn taskbar_created_event_rehides_and_reregisters_appbar() {} // against the TaskbarApi fake
#[test] fn resume_from_sleep_reasserts_position_and_shows_dock() {}
#[test] fn fullscreen_on_another_monitor_click_does_not_reshow_dock() {}
```
```tsx
it("renders one wrapper per layout id, in order", () => {});
it("omits tiles while fullscreen so nothing draws", () => {});
it("gives the apps tile the only shrinkable slot when the bar overflows", () => {});
```

- [ ] **Step 2: Run** both test suites. Expected: FAIL.
- [ ] **Step 3: Implement.** ResizeObserver calls `set_dock_width`. Reserve the full bottom edge as an appbar, with the window only as wide as the bar. Watch every second, and on `TaskbarCreated`, display, power and session events: re-hide taskbar, re-register the appbar, re-assert position (F-016, F-020). In fullscreen, hide the window and emit `shell-changed`. Style: black for now.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Verify on the PC.** Warn the owner first. Run `npm run dev`; probe the window rect is centred and the work area ends at the dock's top; screenshot. Restart Explorer through a scripted, announced `Stop-Process -Name explorer` only with the owner's agreement, otherwise add it to the manual list. Quit; verify taskbar is restored.
- [ ] **Step 6: Commit** `feat: centred dock window with reserved edge`.

### Task 6: Provider runtime

**Files:**
- Create: `src/core/provider.ts`, `src/core/useProvider.ts`
- Test: `src/core/provider.test.ts`

**Interfaces:**
- Produces:

```ts
export type Status = "sample"|"loading"|"ready"|"stale"|"error";
export type ProviderError = { kind: "rejected"|"forbidden"|"offline"|"notfound"|"locked"|"other"; message: string };
export interface Provider<D> {
  id: string; intervalMs: number;
  needsSetup?: () => Promise<boolean>;
  fetch: (previous: D | null) => Promise<D>;   // throws ProviderError
}
export function useProvider<D>(p: Provider<D> | undefined, sample?: D): { data: D | null; status: Status; error?: ProviderError; refresh(): void };
export function setPaused(paused: boolean): void;
```

- [ ] **Step 1: Write failing tests (fake timers):** two subscribers share one fetch; no subscribers means no fetch; interval refetches; `setPaused(true)` stops fetches and resuming refreshes at once; a failure keeps the last value with status `stale` and the typed error; first paint uses the cached value before any fetch resolves (survives restart through `store_load("cache-<id>")`); unconfigured provider returns `sample` status with sample data and never fetches; refresh is not run again while one is in flight.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** a module-level subscription map; failures back off to `intervalMs`, minimum 60 s. Wire `shell-changed` to `setPaused`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: provider runtime with cache and pause`.

### Task 7: Cards

**Files:**
- Create: `src/windows/card/CardWindow.tsx`, `src/design/parts/Card.tsx`, `src/design/parts/ConnectCard.tsx`, `src-tauri/src/shell/card.rs`
- Test: `src/design/parts/Card.test.tsx`, Rust tests in `shell/card.rs`

**Interfaces:**
- Consumes: `WidgetDef.Card`, `useProvider`, `secret_set`.
- Produces: `open_card(widget_id: String, tile_x: f64, tile_width: f64, height: f64)`; pure `card_rect(tile, dock, monitor, card_size) -> Rect`; `<Card logo title pill? footer? action?>`; `<ConnectCard fields={[{id,label,placeholder,secret}]} guide onConnect={(values)=>Promise<void>} />`.

- [ ] **Step 1: Write failing tests:** `card_rect` centres on the tile, clamps to the monitor with 8 px margin, sits above the dock, and never rises past the top of a small screen (it reduces height); `Card` renders header, footer note and action; `ConnectCard` shows the provider's plain error, stores secrets only through `secret_set`, and never renders the saved value back.
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement.** One shared hidden card window, solid card colour, `22px` radius, slide-in of 8 px over 200 ms (G-10), closing on blur or Esc (G-12). Ignore the blur caused by clicking the same tile, as in today's `REOPEN_GUARD`.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: cards opening over their tile`.

### Task 8: Apps widget

**Files:**
- Create: `src/widgets/apps/{index.tsx,Tile.tsx,apps.css}`, `src-tauri/src/apps/{windows,pins,icons}.rs`
- Modify: `src-tauri/src/apps/mod.rs`
- Test: `src/widgets/apps/Tile.test.tsx`, Rust tests in `apps/`

**Interfaces:**
- Consumes: moved `list_windows`, `focus_window`, icon extraction, `open_start`.
- Produces: `apps_list() -> Vec<AppEntry { key, name, icon, pinned, windows: Vec<{hwnd, title}>, active, launch }>`; `apps_activate(key)`; `start_menu()`.

- [ ] **Step 1: Write failing tests:**

```rust
#[test] fn windows_of_one_app_merge_into_one_entry() {}
#[test] fn pinned_store_app_merges_with_its_open_window_by_app_id() {}
#[test] fn titles_with_cyrillic_and_emoji_survive() {}
#[test] fn pin_with_missing_target_is_dropped() {}
```
```tsx
it("keeps a stable order when focus changes", () => {});
it("shows a dot only for open apps", () => {});
it("activates on click", () => {});
```

- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Group by `AppUserModelID`, falling back to exe path. Read pins from `%APPDATA%\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar`. Start tile is the dark rounded square, `0.60T`, with a four-pane silver logo, drawn in SVG. Icons at 96 px, cached per key. Click focuses, minimizes if active, or launches.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Verify.** Screenshot compared against `apps-dark` for icon size and dots.
- [ ] **Step 6: Commit** `feat: Apps widget`.

### Task 9: Clock, weather and system widgets

**Files:**
- Create: `src/widgets/{clock-and-weather,clock,today,system-stats,battery}/index.tsx`, `src/widgets/_providers/{weather,clock,system}.ts`, `src-tauri` command `system_stats` (moved)
- Test: one `*.test.tsx` per widget

**Interfaces:**
- Consumes: `defineWidget`, `useProvider`, `Tile`, `Ring`.
- Produces: `weatherProvider` (Open-Meteo, 30 min, G-03), `clockProvider`, `systemProvider`; city in settings `weather.city`.

- [ ] **Step 1: Write failing tests:** Clock & Weather shows time in the `#ff2e01` block, weekday and day in black, and temperature in a `#c7c6cb` circle, with `–` when no city; 12- and 24-hour formatting; clicking any clock opens a simple date card (month grid, today marked, city and forecast when set), which M3's Calendar replaces; Today matches its entry; System Stats shows two rings; Battery's water height equals the percent, shows a bolt only when charging, and turns orange at or below 20% when unplugged; a machine with no battery shows a plain state instead of breaking.
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement** per each entry in `docs/lumabar/widgets/`. Battery uses two wave layers and bubbles matching `lb-wave`, `lb-wave-back`, `lb-bubble`, and animates only while charging or hovered, to keep idle CPU low.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: clock, weather and system widgets`.

### Task 10: Claude widgets

**Files:**
- Create: `src/widgets/{claude-usage,claude-plan-usage}/index.tsx`, `src/widgets/_providers/claude.ts`, `src/widgets/_shared/ClaudeCard.tsx`
- Modify: `src-tauri/src/lib.rs` (expose existing commands)
- Test: `src/widgets/_providers/claude.test.ts`, widget tests

**Interfaces:**
- Consumes: existing `claude_usage`, `claude_connect` commands.
- Produces: `claudeProvider`, data `{ session: {percent, resetsAt}|null, weekly: same, updatedMs }`; pure `pace(window, lengthMs, now)`, ported from today's `claudePace`.

- [ ] **Step 1: Write failing tests:** expired window shows 0% with no time; pace cases ported from current tests; tile shows orange `#d77655` logo, Session time and percent, and `#30d158` bar; Plan Usage hides the model row with no data rather than showing a blank; card lists Session and Weekly, the Connect explanation, and Disconnect; bars turn warn at 70 and full at 90. Add a repo test that fails if `.credentials.json` appears anywhere in `src/` or `src-tauri/src/` outside a comment forbidding it.
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Draw the spark mark as your own 12-ray SVG.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Claude limit widgets from the status line`.

### Task 11: GitHub and Stripe widgets

**Files:**
- Create: `src/widgets/{github-activity,stripe,stripe-chart}/index.tsx`, `src/widgets/_providers/{github,stripe}.ts`
- Test: provider and widget tests, with fixtures

**Interfaces:**
- Consumes: `http_get`, `ConnectCard`, `Sparkline`, `secret_*`.
- Produces: `githubProvider` (30 min), data `{ days: {date, level, count}[] }`, setting `github.user`; `stripeProvider` (5 min), data `{ currency, today, week, month30, daily: number[], change: number|null, testMode: boolean }`.

- [ ] **Step 1: Write failing tests:** contribution parser ported from today's tests, including the real-page fixture shape; streak, today and week; grid of 13 columns by 3 rows with reference levels; Stripe sums only `charge` and `refund` balance transactions net of fees, counts days in local time, stops at 500 records, and flags `rk_test_` as Test mode; `401` gives `rejected`, `403` gives `forbidden` with Stripe's message, and network failure gives `offline`; amounts shorten like `$1.5k`; the key never appears in provider data or logs.
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement** using `GET /v1/balance_transactions` with `limit=100` and `created[gte]`, per `docs/lumabar/09-integrations.md`.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: GitHub activity and Stripe widgets`.

### Task 12: Picker, menus and dragging

**Files:**
- Create: `src/windows/picker/{PickerWindow,Sidebar,WidgetGrid}.tsx`, `src/windows/menu/Menu.tsx`, `src-tauri/src/shell/windows.rs`
- Modify: `src/windows/dock/Bar.tsx`
- Test: `src/windows/picker/PickerWindow.test.tsx`, `src/windows/dock/Bar.drag.test.tsx`

**Interfaces:**
- Consumes: `byCategory`, `useLayout`, `sample`.
- Produces: `open_window("picker"|"settings")`; dock event `picker-open: bool`; `<Menu items />`.

- [ ] **Step 1: Write failing tests:** picker lists every registered widget under its category, with `All Widgets` count and `N in bar`; search filters by name and description; clicking adds, and clicking again removes; a check mark shows on widgets in the bar; tiles draw from `sample` with `preview` set and run no provider; − badges appear on the dock only while the picker is open; dragging reorders through `move`; right-clicking the dock offers Widgets…, Settings, Lock dock, Quit (G-12).
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement** per `06-widget-management.md` and `widgets-preview`: dark window, left sidebar with solid accent selection, sections with tile and name below. Windows are created on demand and destroyed on close, so they cost nothing when closed.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Add to manual list:** real click, right-click and drag checks.
- [ ] **Step 6: Commit** `feat: widget picker, menus and drag to reorder`.

### Task 13: Settings

**Files:**
- Create: `src/core/settings.ts`, `src/windows/settings/{SettingsWindow,schema,controls}.tsx`
- Test: `src/core/settings.test.ts`, `src/windows/settings/SettingsWindow.test.tsx`

**Interfaces:**
- Consumes: `store_*`, `setStyle`, `setDockSize`, `set_taskbar_mode`.
- Produces: `useSettings`, typed `{ style, theme, accent, size, hour24, seconds, taskbarMode, launchAtStartup, lockDock, weather: { city }, github: { user } }`; `section()`, `slider()`, `toggle()`, `choice()`, `text()`.

- [ ] **Step 1: Write failing tests:** defaults are M size (T=50), taskbar Hidden, 24-hour from locale, theme follows Windows, style Liquid Glass; invalid saved values fall back per key without losing the others; adding a setting needs one schema line and renders with its info tip; size slider updates `--T` live; Lock dock blocks dragging outside the picker; Launch at startup state is read from Windows, not assumed; Quit is reachable.
- [ ] **Step 2: Run** tests. Expected: FAIL.
- [ ] **Step 3: Implement** Mac-style layout (G-01): sidebar with Appearance, Dock, General, About; grouped rows; info tips. M1 offers Liquid Glass and Black, nine accents (G-09), and sizes S, M, L with slider (T 40–62). Other options listed for M2 aren't shown disabled.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Settings window`.

### Task 14: Liquid Glass

**Files:**
- Create: `src-tauri/src/glass/{mod,capture}.rs`, `src/design/glass/{GlassLayer.tsx,refract.frag}`
- Modify: `src/windows/dock/Bar.tsx`, `src-tauri/Cargo.toml`
- Test: `src/design/glass/GlassLayer.test.tsx`, Rust tests in `glass/`

**Interfaces:**
- Produces: `glass_start()`, `glass_stop()`, binary frame event or polled `glass_frame() -> Response`; `<GlassLayer active />`.

- [ ] **Step 1: Spike gate.** Rework the spike from `14-tech-stack.md` to use `Windows.Graphics.Capture` with `WDA_EXCLUDEFROMCAPTURE`, in `glass/capture.rs`. Measure against a moving colourful test window you create and close yourself. Pass: under 3% of machine while moving, under 0.5% at rest, no self-capture. If it fails, try a native composition surface behind the web view. **If neither passes, stop and ask the owner.**
- [ ] **Step 2: Write failing tests:** capture stops under fullscreen, on lock and for Black; frames are skipped when unchanged; lens math (shared TS function) leaves the centre unmoved and displaces most at the rim; `glass_stop` runs on Settings close and doesn't leave capture running (the reference's known bug); resizing recreates the capture surface.
- [ ] **Step 3: Run** tests. Expected: FAIL.
- [ ] **Step 4: Implement** the recipe in `04-glass.md`: edge lens, softening under tiles, tint, rim bright at the corners.
- [ ] **Step 5: Run** tests. Expected: PASS.
- [ ] **Step 6: Verify visually.** Using a test window showing your own colourful gradient behind the dock, save shader frames and compare side by side with `lg-02` and `lg-04`. Tune lens strength and rim until the bend reads the same. Record final values in `04-glass.md`.
- [ ] **Step 7: Commit** `feat: Liquid Glass with live refraction`.

### Task 15: Finish the milestone

**Files:**
- Delete: unused Rust from before the rebuild
- Modify: `README.md`, `HANDOFF.md`, `docs/lumabar/15-feature-checklist.md`
- Create: `docs/manual-checks.md`, `src/test/resources.ps1`

- [ ] **Step 1: Trace.** For each M1 feature ID, confirm a task and test or manual check covers it; add any that's missing.
- [ ] **Step 2: Measure** with `resources.ps1` for idle Black, idle glass and moving glass, against Global Constraints. Fix anything over target.
- [ ] **Step 3: Compare.** Screenshot beside the owner's example image and `lg-04`, then fix differences.
- [ ] **Step 4: Run everything.** `npm test`, `cargo test --lib`, `npm run build`, all passing. Install nothing automatically.
- [ ] **Step 5: Verify safety.** Launch the built app, force-kill it, run `--restore-taskbar`, confirm via probe; launch again, quit normally, confirm.
- [ ] **Step 6: Write `docs/manual-checks.md`** for the owner: clicks, drag, right-click, sleep, Explorer restart, 150% scale.
- [ ] **Step 7: Commit** `chore: complete milestone 1`, and report results, including anything not verified.
