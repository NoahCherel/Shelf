# 03. Design system

Measured from the widget captures and the site's public stylesheet. The tile images are 154 px tall, so sizes here are given per tile height **T** and scale with the dock.

## Why Shelf looked wrong

| Shelf did | Lumabar does |
| --- | --- |
| Small tiles and tiny text in a short bar [O: orca-paste user screenshot] | Tile fills the bar: bar is about 1.09T, with 0.04T padding [M: lg-04] |
| Dark or solid tile fills | Tile is almost clear: 5.5% white, 15% white rim [M: widgets.json] |
| Segoe UI | SF Pro-style tight, bold numerals [M: styles.css] |
| Weak text hierarchy | Numbers are huge next to small grey labels [O] |
| Blank Clock tile top, cramped blocks | Precise colour blocks filling the whole tile [O: clock-and-weather] |
| No refraction | Live refraction at the rim [S: guides/liquid-glass-windows] |

## Typeface

| Item | Detail |
| --- | --- |
| Website | `SF Pro Display`, falling back to Apple system, Inter, Segoe UI [M: styles.css] |
| Live tile class `.lb` | `lumabar UI` (mapped to SF Pro Display files), then Segoe UI Variable Text, Segoe UI, system-ui [M: styles.css] |
| Tile tuning | `letter-spacing: .01em`, antialiased, no text selection [M: styles.css] |
| Weights | 400, 500, and 600–800 served by one bold file [M: styles.css] |
| App's actual font | Almost certainly the same; captures match SF Pro shapes [I] |
| Rights | Apple licenses SF Pro for Apple platforms only, so this needs a decision: G-08 [I] |

## Type scale

Approximate sizes per T, from the captures [M]:

| Role | Size | Weight | Example |
| --- | --- | --- | --- |
| Hero number | 0.40T | Bold | `354.81`, `5:43` [M] |
| Large number | 0.32T | Bold | `8,214`, `25:00` [M] |
| Value | 0.24T | Bold | `100%`, `$2,980` [M] |
| Label | 0.17T | Semibold | `Session`, `Net revenue` [M] |
| Secondary | 0.15T | Regular, muted | `1h 25m`, `net revenue · 30 days` [M] |
| Micro | 0.11T | Semibold | Ring labels, `MCP` details [M] |

Validation against rendered tiles is in [14-tech-stack](14-tech-stack.md#token-render-check).

## Tile material

| Token | Dark | Light | Source |
| --- | --- | --- | --- |
| Fill | `#ffffff` at 5.5% | `#000000` at 4.3% | [M: widgets.json, 96 and 97 of 103 tiles] |
| Rim | `#ffffff` at 14–16% | `#000000` at 9.5–11% | [M: widgets.json] |
| Rim thickness | About 1 px at bar scale | Same | [M: pixel rows] |
| Tile radius | 0.24T | 0.24T | [M: most common 32–39 px at 148–154 px] |
| Tile height | 148–154 px capture | Same | [M: widgets.json] |

Because tiles are translucent, the same artwork works on any style [I]. Exceptions are coloured tiles (Clock & Weather, Battery, Wallpaper Gallery), and in light mode Brightness and Pomodoro keep a dark fill [O].

## Geometry

Measured on `lg-04`, where the bar spans 992×100 px [M]:

| Token | Value |
| --- | --- |
| Tile height T | 92 px there, or 0.92 of bar height [M: lg-04] |
| Bar padding | About 0.04T on every side; "corners follow the widgets" [S: changelog 0.1.11] |
| Gap between tiles | About 0.04T [M] |
| Bar radius | Tile radius plus padding, about 0.28T [I] |
| App icon | About 0.60T, sits bare with no tile [M] |
| Running dot | About 0.05T, blue, under the icon [M] |
| Start tile | Dark rounded square, 0.60T, silver four-pane logo [O] |
| Size on a 1080p desktop | Bar about 66–69 px, T about 60–62 px physical [M: desktop-preview, example image]. S/M/L and DPI: G-06 |
| Gap below pill | About 20 px physical at 1080p, adjustable [M: example image] |

Width classes are free-form rather than a fixed grid: 13 tiles are square, and the rest range from 1.1 to 5.4 wide [M: widgets.json].

## Colour

Site tokens, then tile samples.

| Token | Dark | Light | Source |
| --- | --- | --- | --- |
| Foreground | `#f5f5f7` | `#1c1c1e` | [M: styles.css] |
| Muted | `#98989d` | `#6e6e73` | [M: styles.css] |
| Accent | `#0a84ff` | `#007aff` | [M: styles.css] |
| Error | `#ff453a` | `#d70015` | [M: styles.css] |
| Success | `#30d158` (sample) | `#248a3d` | [M: claude-usage] [M: styles.css] |
| Warning | `#ff9f0a` (sample) | `#b25000` | [M: stopwatch] [M: styles.css] |
| Card | `#181818` | `#ffffff` | [M: styles.css] |
| Surface | `#1f1f1f` | `#f0f0f3` | [M: styles.css] |
| Hairline | `#ffffff1f` | `#0000001a` | [M: styles.css] |
| Track | `#ffffff1f` | `#0000001a` | [M: styles.css] |

| Element | Sample | Source |
| --- | --- | --- |
| Claude tile | `#d77655` | [M: claude-usage] |
| Clock top | `#ff2e01` | [M: clock-and-weather] |
| Clock circle | `#c7c6cb` | [M: clock-and-weather] |
| Pomodoro | `#ff443b` | [M: pomodoro] |
| Timer, rings | `#0b84ff` | [M: timer] |
| Battery | `#5ac8fe` to `#148dfd` | [M: battery] |
| Grid levels | `#006e32`, `#26a642`, `#3ad254`, plus a darker one | [M: github-activity] |
| Stripe badge | `#635aff` | [M: stripe-chart] |

**Accent:** nine choices apply to switches, sliders, rings, icons and highlights; own colour and Album art accent exist [S: guides/what-is-lumabar] [S: changelog 1.0.0, 1.1.0, 1.2.6]. Palette values: G-09.

## Dock styles

| Style | Look | Source |
| --- | --- | --- |
| Liquid Glass | Clear glass, light tint; bends what's behind it at the edges and softens it under tiles | [S: guides/liquid-glass-windows] [O: dock-theme-liquid-glass] |
| iOS Glass | Second glass, deeper tint | [S: guides/liquid-glass-windows] [O: dock-theme-ios-glass] |
| Midnight | Deep dark; no glass; thin rim | [S: guides/liquid-glass-windows] [O: dock-theme-midnight] |
| Black | Solid near-black, about `#181818` | [M: dock-theme-black] |
| White | Solid white with light tiles | [M: dock-theme-white] |
| Clear | No bar, only widgets; widgets can be black, white or frosted glass | [S: guides/what-is-lumabar] [S: changelog 1.2.0]. No capture: G-11 |

Each works as a pill or full width [S: home]. Windows light and dark changes tile artwork [O].

## Icons

- App icons come from the apps, sharp at high DPI [S: changelog 1.2.11]
- Widget glyphs are line icons at about 1.6 weight, with bold play and skip shapes [O]
- Weather uses colour glyphs: yellow sun with a glossy centre, cream moon [O]
- Provider logos are the real brands; a private build needs its own redrawn set or user-supplied files (G-18) [I]

## Motion

Keyframes from the site's stylesheet [M: styles.css]:

| Name | What it does |
| --- | --- |
| `lb-wave`, `lb-wave-back` | Two wave layers sliding opposite ways by 50% on the battery [M: styles.css] |
| `lb-bob` | Moves 1.2 px up and down [M: styles.css] |
| `lb-bubble` | Rises and fades, opacity 0 to .85 to 0, scale .6 to 1 [M: styles.css] |
| `lb-bar` | Playing-music bars: scaleY 1 to 1.83 and back [M: styles.css] |
| `lb-progress` | Bar growing from `--from` to full [M: styles.css] |
| `lb-spin` | Full rotation [M: styles.css] |
| `flip-fall`, `flip-land` | Flip clock: rotateX 0 to −90°, then 90° to 0 [M: styles.css] |
| `toast-in` | Fades in from 28 px to the right [M: styles.css] |

Durations aren't in these rules: G-10. Cards and menus slide out of the bar [S: changelog 1.2.5].

## Cards and menus

| Token | Value | Source |
| --- | --- | --- |
| Card radius | 22 px | [M: styles.css `--radius-card`] |
| Menu radius | 20 px | [M: styles.css `--radius-menu`] |
| Inner tile radius | 10 px | [M: styles.css `--radius-tile`] |
| Card fill | `#1a1a1a`-like dark, solid | [O: ai-cards] |
| Light card shadow | `0 1px 1px #0000000a, 0 1px 3px #0000000d, 0 16px 40px -22px #00000042` | [M: styles.css] |
