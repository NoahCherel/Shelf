# 14. Was Tauri the right choice?

**Yes. Keep Tauri 2 with Rust, and add React.** Shelf looked bad because of its design and frontend approach, not its framework.

## Evidence

- Lumabar itself is "a native Windows app written in Rust and React on Tauri" [S: about]
- Its release assets match Tauri's: small MSI installers and a `latest.json` updater file [M: GitHub release v1.2.13]
- Seelen UI, a much larger desktop shell, is also Rust and Tauri [S: guides/lumabar-vs-seelen-ui]
- Our earlier claim that a web view can't do refraction was wrong: the spike below does it [M: spike]

## Refraction spike

A throwaway Tauri window: BitBlt capture of the screen behind it, excluded from its own capture with `WDA_EXCLUDEFROMCAPTURE`, sent by IPC to a WebGL shader doing an edge lens, softening, tint and rim. Run on your PC: 16 threads, 125% scale, 1000×95 physical px, release build [M: spike].

| Phase | Frames | CPU, whole machine | CPU, as one thread | Private memory, full process tree |
| --- | --- | --- | --- | --- |
| Active: redraw every display frame | 59.1 fps sustained | 3.4% | About 54% | 225 MB |
| Rest: poll 10× a second, draw on change | Drew 19 of 155 polls | 0.27% | About 4% | 179 MB |

Findings:

- The route works: stable 59 fps from capture through a shader in WebView2 [M: spike]
- Self-exclusion works: its own tiles didn't appear in the captured frame, avoiding the "faint copies" bug [M: spike frame] [S: roadmap]
- Each capture took about 17 ms, suggesting BitBlt waits on the display refresh, so it's the wrong long-term API [M: spike] [I]
- Active cost is too high to leave on, so resting matters. **Windows.Graphics.Capture** should improve both, as it delivers frames only on change: untested [I]
- Lumabar claims "a fraction of a percent" at idle; our rest figure of 0.27% is in the same range [S: guides/best-desktop-widgets-windows-11] [M: spike]

Limits of this test:

- One short run on one PC, with no real widgets on it [I]
- The frame had a dark terminal behind it, so it shows softening and rim, but **doesn't prove the bend looks as good as Lumabar's**. Matching that is tuning work for implementation [M: spike frame] [I]
- Memory is mostly WebView2's, and a real dock will use more [I]

## Options compared

Scores from 1 to 5, ours and mostly reasoned [I]; only Tauri's refraction and resource scores were measured here [M: spike].

| Criterion | Tauri + React | Electron | WinUI 3 / C# | WPF | C++ or Rust with DirectComposition | Flutter |
| --- | --- | --- | --- | --- | --- | --- |
| Live refraction | 4 (measured) | 4 | 3 | 3 | 5 | 3 |
| Idle CPU and memory | 3 (measured) | 2 | 4 | 4 | 5 | 3 |
| Text and icon sharpness | 4 | 4 | 5 | 4 | 3 | 3 |
| DPI and multi-monitor | 4 | 4 | 4 | 3 | 4 | 3 |
| Appbar, tray, shell APIs | 5 (Rust) | 3 | 4 | 4 | 5 | 2 |
| Speed of building 100+ widgets | 5 | 5 | 3 | 3 | 1 | 4 |
| Matching a CSS-heavy design | 5 | 5 | 3 | 3 | 1 | 3 |
| Windows 10 and 32-bit | 5 | 4 | 3 | 5 | 5 | 3 |
| Reuses Shelf's working Rust | 5 | 1 | 1 | 1 | 4 | 1 |
| Same as the reference | 5 | 1 | 1 | 1 | 1 | 1 |
| **Total of 50** | **45** | 33 | 31 | 31 | 34 | 26 |

Why the others lose:

- **Electron:** same page model, far heavier installer and memory [I]
- **WinUI 3 and WPF:** native feel, but a slower path to this design, and a rewrite [I]
- **Native composition:** best performance, but 100+ custom-drawn widgets would be very slow to build [I]
- **Flutter:** weakest on Windows shell access [I]

## Recommended stack

| Layer | Choice | Why |
| --- | --- | --- |
| Shell | Tauri 2, Rust | Reference's stack; existing code |
| UI | React and TypeScript with Vite | Same as reference; suits the widget contract [S: about] |
| Styling | CSS variables from tokens | [Design system](03-design-system.md) |
| Glass | Windows.Graphics.Capture into a shader | Try WebGL first, with a native surface as fallback (G-07) [I] |
| Local data | Files, plus SQLite for Screen Time | [Architecture](13-architecture.md) |

Open follow-up for implementation planning: a second spike with Windows.Graphics.Capture and bright, colourful backgrounds, to compare the bend directly against Lumabar's images [I].

Resource targets to hold the rebuild to [I]:

| Measure | Target |
| --- | --- |
| Idle CPU, solid style | Under 0.5% of machine |
| Idle CPU, glass at rest | Under 0.5% of machine |
| Glass while content moves | Under 3% of machine |
| Private memory | Under 300 MB with a full dock |
| Fullscreen | No drawing |

## Token render check

Sample tiles built only from the measured tokens were compared to Lumabar's captures, on the same background, with a mean pixel difference (lower is closer). Differences also include artwork the sample leaves out, such as logos and the chart [M: token-check].

| Tile | SF Pro | Inter |
| --- | --- | --- |
| Claude Usage | 10.57 | 11.57 |
| Stripe Chart | 17.04 | 16.63 |
| Date, no artwork, fairest test | **7.61** | 10.62 |
| Average | 11.74 | 12.94 |

Geometry, material and hierarchy visibly line up, and SF Pro is the closest font, with Inter a near second. See `_evidence/sheets/token-check.png`. Exact type sizes still need checking widget by widget [M: token-check] [I].
