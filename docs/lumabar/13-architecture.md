# 13. Proposed architecture

A proposal for the rebuild, not a description of Lumabar, whose source isn't public. All of it is our reasoning [I] unless tagged. The goal: **adding a widget means adding one folder**.

## Principles

- One folder per widget; the app never lists widgets by hand [I]
- Tiles don't fetch anything; they draw what a provider gives them [I]
- All design values come from tokens, so a style change needs no widget edits [I]
- Windows-specific code stays in Rust behind typed commands [I]
- Paint from cache first, so the dock appears at once [S: changelog 1.2.1]
- Off-screen or fullscreen means no work [S: changelog 1.2.8, 1.2.11]

## Shape of the app

```
Rust core
├─ shell/      taskbar, appbar, displays, fullscreen, sleep and unlock events
├─ apps/       windows, pins, icons, previews, jump lists
├─ tray/       tray icons (isolated, built last)
├─ glass/      screen capture, change detection, frames
├─ system/     CPU, RAM, network, battery, audio, media, toggles
├─ screentime/ foreground tracking, local history
├─ secrets/    key storage
└─ net/        HTTP for providers, so keys stay out of the page
        │ typed commands and events
React UI
├─ windows/    dock, card, picker, settings, toast
├─ design/     tokens, styles, shared parts (Tile, Ring, Sparkline, Bar…)
├─ core/       registry, layout store, provider runtime, settings
└─ widgets/    one folder per widget
```

## Windows

| Window | Purpose | Notes |
| --- | --- | --- |
| Dock | The bar; one per display | Fits the bar; hit-testing limited to it [I] |
| Card | One shared detail window | Positioned over its tile; downward at the top edge [S: changelog 1.2.5] |
| Picker | Widget picker | Created on demand, freed on close [S: changelog 1.2.6] |
| Settings | Settings | Created on demand; must stop any glass work when closed [S: roadmap] |
| Toast | Alerts, summaries | Above the dock [S: guides/screen-time-windows] |

All run in one WebView2 environment, sharing the renderer where possible [S: changelog 0.1.4].

## The widget contract

```ts
export default defineWidget({
  id: "stripe-chart",
  name: "Stripe Chart",
  description: "A line chart of your Stripe revenue.",
  category: "finance",
  shape: { width: 3.1 },            // in tile heights; square is 1
  tile: StripeChartTile,            // draws from { data, status, theme }
  card: StripeCard,                 // optional detail view
  provider: stripeProvider,         // optional; shared by related widgets
  settings: stripeSettingsSchema,   // optional; shown on the card
  menu: [...],                      // optional right-click items
  sample: { week: 2980, change: 31, daily: [...] }, // preview, and pre-connect state
});
```

The registry discovers every `widgets/*/index.ts` at build time. The picker, categories, search, counts and sample tiles all come from it, so nothing else changes.

## Providers

A provider owns one source, and tiles only subscribe.

| Rule | Why |
| --- | --- |
| Shared: Stripe and Stripe Chart use one provider, and so do all 14 clocks | Avoid duplicate requests [S: changelog 1.0.2] |
| Runs only with a visible subscriber | [S: changelog 1.2.11] |
| Declares its refresh interval | Lives in one place |
| Keeps the last value on disk, with its time | Survives restarts and failures [S: changelog 1.2.10, 1.2.11] |
| Returns typed errors: `rejected`, `forbidden`, `offline`… | Plain words on the card [S: connect pages] |
| Reads logs incrementally | [S: changelog 1.2.1] |
| Pauses in fullscreen and sleep; refreshes on wake | [S: changelog 1.2.11] |

Status values every tile handles: `sample`, `loading`, `ready`, `stale`, `error`.

## Stores

| Store | Holds | Where |
| --- | --- | --- |
| Layout | Per display: order, narrowing, edge | App data file |
| Settings | Validated by a schema | App data file |
| Widget state | To-dos, notes, timers | App data file, per widget |
| Secrets | Keys and tokens | DPAPI or Credential Manager (G-15) |
| Cache | Provider values | App data, safe to delete |
| Screen Time | 90 days | SQLite [S: guides/screen-time-windows] |

Windows share state through Rust, not `localStorage`, so files can be backed up and inspected. Schema versions allow later migration.

## Settings

A schema drives each screen:

```ts
section("Dock", [
  slider("size", { min: 40, max: 96, marks: { S: 44, M: 50, L: 62 }, tip: "…" }),
  toggle("floatOverWindows", { tip: "…" }),
  choice("displays", ["one", "all", "follow"]),
]);
```

So a new setting is one line, with its info tip [S: changelog 1.2.13], search and red "new" dot included.

## Design system in code

- `tokens.css` holds the [measured values](03-design-system.md) as variables, with T as the base unit
- A style is one small token file (`liquid`, `ios`, `midnight`, `black`, `white`, `clear`)
- Dark and light are token sets; accent is one variable
- Shared parts carry the look: `Tile`, `Rim`, `Ring`, `Bar`, `Sparkline`, `RoundButton`, `Card`, `Row`
- Tile size is defined only by T, so the whole dock scales from one slider

## Glass pipeline

Rust captures the region behind each dock, excluding itself, and only produces frames on change. A shader draws lens, softening, tint and rim. Tiles float above in the same page. It stops in fullscreen, under solid styles, and when the dock is hidden. Details are in [04-glass](04-glass.md); route choice in [14-tech-stack](14-tech-stack.md).

## Worked example: add a widget

Adding **Moon Phase**:

1. Create `widgets/moon-phase/index.ts`, `Tile.tsx` and `provider.ts`
2. Set `category: "weather"`, `shape: { width: 1 }`, a `sample`
3. Add a test comparing the sample tile to a stored image
4. Build

It now appears in the picker's Weather section and search, can be added, dragged and removed, and scales with every style. **No other file changes.**

## Worked example: remove a widget

Delete its folder. A saved layout that still mentions the id silently drops it on load, so it can't break startup.

## Testing

| Level | Checks |
| --- | --- |
| Unit | Parsers, calculations, providers against fixtures, as Shelf's iCal tests did |
| Visual | Each widget's sample tile against stored images, in every style |
| Reference check | Selected tiles against Lumabar's captures, using `token-check` during design work |
| Rust | Settings migrations, taskbar state save and restore |
| Manual script | Sleep, unlock, monitor plug and unplug, fullscreen, DPI change, Explorer restart |
| Resource budget | Idle CPU and memory measured in CI-like runs; targets in [14-tech-stack](14-tech-stack.md) |

## Safety rule

The taskbar must always come back. Keep Shelf's lessons: a saved state file, a panic hook, `--restore-taskbar`, a repeated re-hide with a lock, and never overwriting the user's setting on a second restore.

## What to keep from current Shelf

| Keep or adapt | Replace |
| --- | --- |
| `win.rs`: taskbar, appbar, icons, media, fullscreen | All of `src/`, rewritten in React with tokens |
| `claude_usage.rs`: status line hook and its tests | `localStorage` stores |
| iCal parser and tests | Solid-coloured tile styling |
| GitHub contribution parser | Stripe `charges`, replaced by balance transactions |
| Safety lessons above | `lib.rs` structure |
