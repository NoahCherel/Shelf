# 04. The glass

This is the main visual difference between Lumabar and everything Shelf has done so far, and the main technical unknown.

## What the site says

- "It bends your wallpaper live - not a blur" [S: home]
- The wallpaper and any window behind show through, "bent at its rounded edges and softened under the tiles" [S: guides/liquid-glass-windows]
- It keeps up when something moves behind it: a window, a new wallpaper, an app full of colour [S: guides/liquid-glass-windows]
- "Real refraction. Not a blur." [O: lg-04]
- Liquid Glass is clear with a light tint; iOS Glass has a deeper tint [S: guides/liquid-glass-windows]
- Works on Windows 10 and 11 [S: guides/liquid-glass-windows]
- Only redraws while something behind changes; rests otherwise [S: guides/liquid-glass-windows]

## How it's built: the clues

| Clue | What it tells us | Source |
| --- | --- | --- |
| Styles "kept capturing the screen" and could show "faint copies of the dock's own tiles" | It uses **real screen capture**, and has to exclude its own window | [S: roadmap] |
| "Reflect what is behind the dock right now, never a window you already closed" | Capture is live, not a cached wallpaper | [S: changelog 0.1.9] |
| "Picks up a new wallpaper, and the desktop again after the PC is unlocked" | Capture stops and restarts around lock | [S: changelog 1.2.0] |
| "Blinks less in screen recordings" | It interacts with recorders' capture | [S: changelog 1.0.1, 1.2.6] |
| "Follows in steps" while resizing with glass | The capture surface is resized in steps | [S: changelog 1.2.10] |
| "Smoother glass on high-resolution screens" | Cost scales with pixel count | [S: changelog 1.2.12] |
| "Rest" when nothing changes | It detects change and pauses | [S: guides/liquid-glass-windows] |
| Rust, React, Tauri | Probably native capture feeding a shader or displacement filter | [S: about] [I] |

Which capture API, and whether the shader runs in WebGL or natively, is Gap G-07. The [spike](14-tech-stack.md#refraction-spike) tests one route.

## What it looks like

- The image continues through the bar, but is bent near the rounded ends [O: lg-02] [O: glass-showcase]
- Over bright backgrounds the bar is mostly clear; its contrast comes from the rim and tile fill [O: lg-02]
- A bright top and bottom rim, stronger at the corners, catching the wallpaper's colour [O: lg-02]
- Under tiles the image is softer [S: guides/liquid-glass-windows]
- With a rainbow horizon behind it, colours pass through and lens at the ends [O: lg-02]
- Dragging the dock up and down: picks up light as it moves [S: guides/liquid-glass-windows] [O: glass-showcase]

Frames from the 13-second clip show it staying smooth while dragged, with no visible lag [O: glass-showcase, 2 fps sample]. That sample is too coarse to measure frame rate.

## The effect, as a recipe

An inferred model to test, not a known implementation [I]:

1. Capture the screen region behind the dock, excluding the dock itself.
2. Compute a distance from the rounded-rectangle edge.
3. Displace sampling near the edge, like a thin lens; leave the centre straight.
4. Lightly blur under tile rectangles.
5. Apply the style's tint.
6. Add a rim highlight, brighter at the corners.
7. Draw tiles on top.
8. When a frame is unchanged, skip the work.

## What we built

Windows.Graphics.Capture on the primary monitor, excluded from itself with `WDA_EXCLUDEFROMCAPTURE`, cropped to the bar and handed to a WebGL shader. It runs at up to 30 frames a second, and skips frames whose pixels match the last one [M: resources.ps1].

Measured on the owner's PC, release build, Shelf's own process tree only: 0.15% of the machine at rest, 2.14% with a moving colourful window behind the dock, 242 MB private [M: resources.ps1].

Tuned by eye against `lg-02` and `lg-04`, with T in logical px [M: glass bench]:

| Value | Setting |
| --- | --- |
| Lens band | 24 px from the edge |
| Lens strength | 22 px at the rim, cubic falloff |
| Softening under tiles | 2.6 px kernel |
| Tile darkening, dark theme | 46% of the brightness behind |
| Tile wash, light theme | 62% toward white |
| Tint | 2% white |
| Rim | 58% toward a mostly white copy of what's behind, stronger on top and bottom and at corners |

The reference's images show something the widget captures couldn't: on glass, tiles darken what's behind them to about half brightness [O: lg-02]. Their 5.5% white fill sits on top of that [I].

**Side effect:** while Liquid Glass is on, the dock is invisible to anything that captures the screen, including ordinary screenshots and recordings. Black doesn't have this, as it needs no capture [M: moving.png].

## Costs and bugs to avoid

| Problem | Source |
| --- | --- |
| Glass kept capturing after Settings opened, wasting CPU | [S: roadmap] |
| Faint copies of the dock's own tiles | [S: roadmap] |
| Blinking in OBS and recordings | [S: changelog 1.0.1, 1.2.6] |
| Stale content from closed windows | [S: changelog 0.1.9] |
| Lost wallpaper after unlock or wallpaper change | [S: changelog 1.2.0] |
| Rough at full width and on high-DPI screens | [S: changelog 0.1.13, 1.2.12] |
| Must stop entirely under fullscreen games | [S: changelog 1.2.11] |
