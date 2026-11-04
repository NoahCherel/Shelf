# 11. History and lessons

All 30 releases from the changelog, condensed. Lumabar went from 0.1.4 to 1.2.13 in 37 days, which helps show which problems are hard [M: changelog].

## Releases

| Version | Date | Main changes [S: changelog] |
| --- | --- | --- |
| 1.2.13 | Nov 4 | Apps act like taskbar buttons with previews, jump lists, groups; Microphone tile; scheduled wallpapers; Show on desktop; info tips [S: changelog] |
| 1.2.12 | Nov 4 | Show Desktop tile; Polar milestones; Hidden/Auto-hide choice back; preview title and close [S: changelog] |
| 1.2.11 | Nov 2 | Win key with auto-hide; taskbar stays away on every dock screen; sharper text and icons; stops drawing under fullscreen; off-screen widgets rest [S: changelog] |
| 1.2.10 | Oct 31 | AI card chart; new Storage, Sound and Search Console cards; smooth Size drag; sleep fix; bigger tile text [S: changelog] |
| 1.2.9 | Oct 30 | Size drag; Distance from edge; Float over windows; Notes shows last note [S: changelog] |
| 1.2.8 | Oct 28 | Search Console; Gmail list; 152 currencies; app volumes; drives; Energy saver; Spacing; Bluetooth batteries; °C/°F; check marks [S: changelog] |
| 1.2.7 | Oct 25 | Auto-hide no longer flashes white [S: changelog] |
| 1.2.6 | Oct 25 | Any app or folder as a widget; groups; jump lists; Start quick menu; drag over apps; accent colour; red dots [S: changelog] |
| 1.2.5 | Oct 22 | End task; Quick access; clock opens Calendar; cards open over the widget, with a slide [S: changelog] |
| 1.2.4 | Oct 22 | Dock on every display; Follow; Lock dock; Gemini via Antigravity [S: changelog] |
| 1.2.3 | Oct 22 | Mac-style Trash; one icon per app; reserves space from boot; corporate networks [S: changelog] |
| 1.2.2 | Oct 21 | Claude token count fix [S: changelog] |
| 1.2.1 | Oct 21 | Far lighter Claude widget; dock 3 s faster [S: changelog] |
| 1.2.0 | Oct 20 | Auto-hide; Win+T; Ethernet; Clear widget materials; hover previews; update toast progress [S: changelog] |
| 1.1.1 | Oct 20 | Faster menu, sticky sidebar; drag open apps; exact window screenshots; +N on calendar [S: changelog] |
| 1.1.0 | Oct 19 | Automations and Quiet hours; unified Calendar; Day Timeline; revenue goal; Album art accent; Clear; text from screenshots [S: changelog] |
| 1.0.2 | Oct 16 | Shopify, Lemon Squeezy, Paddle, Gumroad; Plausible, Dub, Resend, Linear, Supabase; Instagram; uniform chart tiles; guides [S: changelog] |
| 1.0.1 | Oct 15 | Narrow dock; Tray grid; Language list; new AI cards; Claude card [S: changelog] |
| 1.0.0 | Oct 10 | Drag to pin; files on dock; Screen Time; Temperature; accent; Mac-style Settings; hover names [S: changelog] |
| 0.1.14 | Oct 7 | Alt+T; more toggles; Clock & Weather; seven-segment; seconds; scroll for volume [S: changelog] |
| 0.1.13 | Oct 6 | Choose toggles; toggles slide; smoother glass [S: changelog] |
| 0.1.12 | Oct 6 | Stopwatch; feedback with screenshots; DataFast redesign [S: changelog] |
| 0.1.11 | Oct 4 | Full width; alert sounds; own Start picture; right-click fixed; tighter padding [S: changelog] |
| 0.1.10 | Oct 1 | First update through the new updater [S: changelog] |
| 0.1.9 | Oct 1 | One-click updates; glass reflects the present; smoother when dragged [S: changelog] |
| 0.1.8 | Sep 30 | Online-aware Wi-Fi; water battery; brightness accent; plain errors [S: changelog] |
| 0.1.7 | Sep 28 | Brightness and display mode; city picker; 12-hour; AI tiles; 32-bit [S: changelog] |
| 0.1.6 | Sep 28 | Minimal Theme and Recently Opened; own logo [S: changelog] |
| 0.1.5 | Sep 28 | Activation only on press [S: changelog] |
| 0.1.4 | Sep 28 | Less memory: one renderer, caches returned when idle [S: changelog] |

## Lessons for the architecture

| Lesson | Evidence | Design consequence |
| --- | --- | --- |
| One web renderer per dock, not one per widget | 0.1.4 "one renderer" | All tiles in one webview [I] |
| Redraw only on change | 1.0.2 | Per-widget state, memoised rendering [I] |
| Rest what's off-screen | 1.2.11 | Visibility-aware providers [I] |
| Stop at fullscreen and free memory | 1.2.8, 1.2.11 | Global pause state [I] |
| Avoid animating continuously | 1.2.8, 1.0.1 | Charts and music need care [I] |
| Read logs incrementally | 1.2.1, 1.2.2 | Providers keep cursors [I] |
| Keep the last good value | 1.2.5, 1.2.11 | Provider cache survives failures and restarts [I] |
| Handle sleep, unlock, monitor changes | 1.2.0, 1.2.10, 0.1.11 | Central Windows event hub [I] |
| Handle shell surprises | 1.2.6, 0.1.11 | Re-assert taskbar and appbar state [I] |
| Show sooner | 1.2.1 | Paint from cache before loading data [I] |
| Show real errors in words | 0.1.8, 1.0.2 | Providers return typed errors [I] |
| Tray access can crash others | 1.2.13 | Tray layer gets isolated and last [I] |
| Unicode in window titles | 1.2.9 | Test Cyrillic and emoji [I] |
| Screen Time on a busy PC | 1.2.8 | Sampling must be robust [I] |
| Don't break when a vendor changes login | 1.2.4 | Providers are replaceable [I] |

## Direction

Features moved toward replacing the taskbar completely (previews, jump lists, groups), and toward widgets that cooperate (Calendar, Automations) [I]. For Shelf's order of work, that suggests dock and apps first, then the widgets you use, and cooperation last [I].
