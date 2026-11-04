# Shelf

A personal widget dock for Windows 10/11 that replaces the taskbar. Built with
Tauri v2: a Rust backend and a plain HTML/CSS/JS frontend, with no bundler.

The dock is a centered pill of clear dark glass that floats above the bottom edge
and is only as wide as its contents, so the desktop on either side stays clickable.
Maximized windows still stop above it.

Right-click an app to pin or unpin it. A dot marks a running app; pinned apps that
aren't running follow without one, and clicking one launches it.

| Widget | In the bar | Shows | Needs |
| --- | --- | --- | --- |
| Net revenue | Once set up | Last 7 days, change, 14-day line | Stripe restricted key |
| Claude usage | Always | Session and weekly limits, reset times, pace | Connect in its panel |
| GitHub activity | Once set up | Today, week, streak, contribution grid | Username |
| Clock & weather | Always | Time, date, temperature; click the temperature for the forecast | City for temperature |
| Now playing | While playing | Track, with previous/play/next | |
| Next event | When there is one | Next event, and the 14-day agenda in its panel | iCal links |
| Pomodoro | While running | Countdown, start and pause | |
| Battery, CPU and RAM, next to-do, latest note | If turned on | | Settings > Keep in the bar |
| To-dos, Notes, System, AI spend, Settings | Under the chevron | | |

## Claude usage

No key is needed. Claude Code hands its limits to its status line command, so
**Connect** adds Shelf to that command in each Claude Code config folder
(`~/.claude` and every Orca profile):

- Whatever status line you already had keeps running and showing its output.
- Each `settings.json` is backed up once, as `settings.json.shelf-backup`.
- Only the limits are saved, to `%APPDATA%\Shelf\claude_usage.json`.
- **Disconnect** puts the previous command back.

Shelf never reads Claude's login tokens. Anthropic's terms keep those for Claude
Code and its own apps, so please don't change this to use `.credentials.json`.

The numbers refresh while Claude Code is in use. In between, they show the last
reading, and a window whose reset time has passed shows 0%. If another tool
rewrites the status line, the panel offers Connect again.

If iCal links are set, Shelf also pauses playing media within a minute of a
timed event starting. Turn this off in Settings.

## Setup

You need [Rust](https://rustup.rs), Node.js, and the Microsoft C++ build tools.

```sh
npm install
npm run dev     # run from source
npm run build   # build the NSIS installer
```

## Getting your taskbar back

Shelf hides the Windows taskbar while it runs and restores it when it quits.
Quit from **Settings > Quit Shelf**. The tray menu also has Quit, but the tray
is hidden along with the taskbar.

Shelf can't restore the taskbar if it's killed instead of quit. That includes
crashes that skip the panic hook, ending it in Task Manager, and pressing
Ctrl+C on `npm run dev`. To recover, run:

```sh
shelf.exe --restore-taskbar
```

Restarting Windows Explorer from Task Manager also brings the taskbar back, but
it won't undo the auto-hide setting. Shelf saves your original auto-hide setting
in `%APPDATA%\Shelf\taskbar_state.txt`, and `--restore-taskbar` puts it back.

## Where your data lives

Settings, to-dos, notes and cached API results are in the WebView's
`localStorage`, under `%LOCALAPPDATA%\dev.personal.shelf`.

**API keys are stored there in plain text**, so use restricted keys where the
provider offers them. Stripe keys only need read access to charges. Keys are
sent only to their own provider, through the Rust backend.

## Known limitations

- The glass has no blur or edge refraction: a WebView can't sample the desktop
  behind it. The look is dark-only.
- The AI spend figure needs an OpenAI admin key and covers the current month in
  UTC.
- The GitHub grid reads your public contribution page, which isn't an official
  API and could change. Private work only counts if your profile shows it. The
  events list in its panel can lag by a few hours.
- Calendar events with a `TZID` are treated as local time. Only daily and weekly
  repeats are expanded; monthly and yearly events show their first occurrence
  only.
- The dock lives on the primary monitor. It doesn't yet react to monitor or DPI
  changes, so restart Shelf after changing them.
- There's no single-instance guard, so don't launch it twice.
