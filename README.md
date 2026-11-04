# Shelf

A private Windows taskbar replacement: a centred glass pill of widgets, built with Tauri 2, Rust and React. It's for personal use and isn't published or redistributed.

## Run it

```
npm install
npm run tauri build -- --no-bundle
src-tauri\target\release\shelf.exe
```

For development, `npm run dev` runs it against the live frontend.

| Command | Does |
| --- | --- |
| `shelf.exe --quit` | Closes the running dock normally |
| `shelf.exe --restore-taskbar` | Puts the Windows taskbar back if it's ever stuck |

The taskbar always comes back: on quit, after a crash, and within seconds if the process is killed.

## Using it

Right-click the dock for Widgets…, Settings, Lock dock and Quit. In Widgets…, click a tile to add or remove it. Drag widgets along the dock to reorder them. Click a tile for its card.

While Liquid Glass is on, the dock doesn't appear in screenshots or recordings, because that's how it avoids seeing itself in the glass. The Black style has no such effect.

## How it's built

```
src-tauri/src/
  shell/       taskbar, appbar, dock and card windows, shell events
  apps/        pins, open windows, icons
  glass/       screen capture for Liquid Glass
  system/      CPU, memory, battery, startup
  secrets.rs   keys, encrypted with DPAPI
  store.rs     JSON files under %APPDATA%\Shelf\data
  net.rs       HTTP, where keys get attached so they never reach a page
  claude_usage.rs   limits from Claude Code's status line
src/
  core/        widget contract, registry, layout, providers, settings
  design/      tokens, shared parts, the glass shader
  widgets/     one folder per widget
  windows/     dock, card, picker, settings, menu, gallery
```

**To add a widget:** create `src/widgets/<id>/index.tsx` exporting `defineWidget({...})`. It then appears in the picker with search and categories, and nothing else changes. To remove one, delete its folder. A saved layout that still names it drops it on load.

Claude limits come only from the status line feed. Claude's own login is never read, as Anthropic's terms keep those tokens for Claude Code and its apps.

## Tests

| Command | Checks |
| --- | --- |
| `npm test` | Frontend |
| `cargo test --lib` in `src-tauri` | Rust; never touches the real taskbar |
| `sh src/test/e2e.sh <folder>` | Drives the built app through WebView2's debug port. Hides the taskbar |
| `sh src/test/measure.sh` | CPU and memory at rest and with motion. Hides the taskbar |
| `src/test/probe.ps1` | Read-only look at the dock, work area and taskbar |

`?w=gallery&all=1` shows every widget's sample, and `?w=gallery&glass=glow` runs the shader over a test scene, both in an ordinary browser.

Real-hardware checks are in [`docs/manual-checks.md`](docs/manual-checks.md). The study behind the design is in [`docs/lumabar/`](docs/lumabar/README.md), and the build plan in [`docs/superpowers/plans/`](docs/superpowers/plans/).
