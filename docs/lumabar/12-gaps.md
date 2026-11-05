# 12. Gaps

Everything public sources couldn't answer, and what we decided. The owner delegated these decisions on 2026-11-04, so each last column is now the decision to build, and any can be changed later [I]. Items marked ⚠️ matter most.

| ID | Unknown | Why it matters | Decision |
| --- | --- | --- | --- |
| G-01 ⚠️ | Settings window has never been shown publicly | The screen you'd use most after the dock | Mac System Settings layout: left sidebar, right pane of grouped rows, using the picker's visual style [O: widgets-preview] [S: changelog 1.0.0] |
| G-02 | Loading and most error or empty states | Every tile needs them | Keep last value and dim slightly; plain-language errors on the card; empty state modelled on Calendar's [O: widgets-preview] [I] |
| G-03 | Refresh rates for many tiles; services behind Weather, Currency and Metric | Rate limits and accuracy | 5 minutes for accounts, 30 for weather; Open-Meteo for weather; pick free APIs for Currency and Metric [I] |
| G-04 ⚠️ | Cards never shown: Weather, Pomodoro, System Stats, Network, Media, GitHub, others | About half of cards must be invented | Follow the standard card anatomy [O: ai-cards] and show the tile's data in more depth [I] |
| G-05 ⚠️ | AI tiles reading other tools' logins | Anthropic's terms rule it out for Claude [S: code.claude.com/docs/en/legal-and-compliance]; other vendors unchecked | Claude via status line; check each vendor's terms before building ChatGPT, Gemini, Grok, Cursor; use key-based or local-history tiles meanwhile [I] |
| G-06 ⚠️ | Exact S, M, L pixels; DPI behaviour | Sets the dock's whole look | M: T = 50 logical px (62 physical at 125%), bar 55. S and L at about 0.8× and 1.25×; slider between. Matches your screen and example [M: example image] [I] |
| G-07 ⚠️ | Glass internals: capture API, shader location, resting method | Largest technical risk | Windows.Graphics.Capture into a WebGL shader, then native if too slow; see spike [I] |
| G-08 ⚠️ | Font rights | SF Pro matched best in testing, but Apple licenses it for Apple platforms [I] | Font stack is `SF Pro Display` if installed on the PC, then bundled Inter. SF Pro itself is never bundled [M: token-check] [I] |
| G-09 | Exact nine accent colours | Settings row | Apple system palette: blue, purple, pink, red, orange, yellow, green, teal, graphite [I] |
| G-10 | Animation durations and easing | Feel | 200 ms ease-out slides; 150 ms hover; battery wave about 6 s loop; confirm by eye on the clip [I] |
| G-11 | Clear style never pictured | One of six styles | No bar; widgets with chosen material (black, white, frosted) [S: changelog 1.2.0] [I] |
| G-12 | Exact right-click menus; where new tiles land; duplicates; click-away on cards | Daily behaviour | Menu: Widgets…, Settings, Lock dock, Quit. New tile goes last. No duplicates except apps. Click-away closes cards [I] |
| G-13 | Automation thresholds and timing | Alerts | Pause 1 minute before meetings; warn at 80% and 95%; renewal reminder 3 days ahead; quiet hours 22:00–08:00 [I] |
| G-14 | Tiles missing from the catalogue: Search Console, Microphone, Show Desktop, Trash as distinct, Minimal Theme | Scope count | Extra widgets beyond 103, built after the catalogue [S: changelog 1.2.8, 1.2.12, 1.2.13] [I] |
| G-15 | How keys are protected | Security | DPAPI or Credential Manager [I] |
| G-16 | Default first layout | First impression | Your example: Claude, apps, GitHub, Clock & Weather [I] |
| G-17 | Updates for a private tool | Convenience | Skip the updater; rebuild from source [I] |
| G-18 | Third-party logos | Tiles use real brand marks [O] | Private use: own redrawn simple marks, or brand files you add yourself locally; none bundled from Lumabar [I] |
| G-19 | Windows light/dark vs dock theme | Which image set applies | Follow Windows, with an override [O] [I] |
| G-20 | YouTube demo not studied (`fRQ1l9xqBwY`) | Possibly the best motion reference | Not needed to start. Only the 13 s clip was analysed, so check the demo when tuning motion [S: gh-readme.md] [I] |
| G-21 | How previews, jump lists and tray forwarding work | Hard shell features | Research spikes during implementation planning: DWM thumbnails, Shell APIs, tray hosting [I] |
| G-22 | Whether the Clock click on temperature differs | Small | Whole tile opens Calendar, per the changelog [S: changelog 1.2.5] [I] |

## Owner changes after using Milestone 1

These replace the study's values, on the owner's word, 2026-11-04:

- The dock floats over windows by default, so apps use the whole screen. Reserving the edge is a setting, off by default. It left an empty strip beside and under the pill.
- The gap under the dock is 6 logical px by default, not 17, and adjustable.
- Clock & Weather has no red block. The reference's colour blocks looked wrong on the glass.
- Each app gets 0.96T of width, not the reference's 0.78T, as on Windows' and macOS' own docks.
- A Search button sits beside Start, and a Status tile shows Wi-Fi, sound, battery and notifications. Each opens Shelf's own card right above it, except notifications, as Windows' panels open at fixed places, unrelated to the tile (2026-11-05).
- With the Battery widget on the dock, the Status tile's battery gives way to a Quick Settings icon, and the widget opens that card, so the battery shows once.
- An app's previews follow Windows rather than the reference: live pictures, peek, and a click on several windows shows them.
- Right-clicking an app shows what a Windows taskbar button offers: its name to open it, pin or unpin, End task and close (2026-11-05). Right-clicking Start shows Windows' quick menu, which has Task Manager. Shelf's menu stays on everything else.
- Clicking the dock no longer takes focus from the current app, and Start toggles from its tile.
- The app in focus gets a lit plate behind its icon, and a longer dot. The reference's identical dots don't show which one it is.

## Limits of this study

- Nothing here was seen in a running copy, because you chose public sources only [I]
- Interaction detail is mostly from text and stills, so feel can only be approximated [I]
- Sample numbers in captures aren't real behaviour [S: widgets]
