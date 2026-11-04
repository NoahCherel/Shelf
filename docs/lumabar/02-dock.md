# 02. The dock

## Shape and position

| Behaviour | Detail |
| --- | --- |
| Edge | Bottom by default; top by dragging; remembered [S: docs] |
| Move to top | Drag by an empty spot or gap, release in the top half; panels then open downward [S: docs] [S: changelog 1.0.2] |
| Top in Settings | Not yet; planned [S: roadmap] |
| Pill | Floating, width set by its contents, centred [O: look-01] [O: lg-04] |
| Full width | Spans the edge like the taskbar, evenly inset [S: changelog 0.1.11] [O: look-04] |
| Narrow | Drag either end down to a single tile, scroll for the rest; double-click an end to undo [S: changelog 1.0.1] |
| Scrolling | Mouse wheel moves sideways, gliding; touchpad swipes handled [S: changelog 1.2.10] |
| Off-screen widgets | Rest, and keep rounded corners at the edge [S: changelog 1.2.1, 1.2.11] |

## Size and spacing

| Setting | Detail |
| --- | --- |
| Size | S, M, L; drag from smaller than the taskbar to big enough for 1440p; dock follows as you drag (in steps with glass) [S: docs] [S: changelog 1.2.9, 1.2.10] |
| Distance from edge | Raises the dock off the edge [S: changelog 1.2.9] |
| Spacing | Drag the space between widgets [S: changelog 1.2.8] |
| Default padding | "Half the padding around the dock and half the gap between widgets, corners that follow the widgets'" [S: changelog 0.1.11] |
| Exact pixels | See [design system](03-design-system.md); S, M and L values are Gap G-06 |

## How it shares the screen

| Mode | Detail |
| --- | --- |
| Reserved (default) | Windows make room; each dock keeps its own space on its screen; maximized apps reach it with no gap [S: guides/rainmeter-alternative] [S: changelog 1.2.4, 1.2.11] |
| Float over windows | Stays on top, and maximized windows use the whole screen under it [S: changelog 1.2.9] |
| Auto-hide | Slides away, returns when the pointer touches the edge or Win opens Start, then leaves when Start closes [S: changelog 1.2.0, 1.2.11] |
| Show on desktop | Auto-hide option: stays up on an empty desktop [S: changelog 1.2.13] |
| Lock dock | Widgets move only while the Widgets menu is open; the dock stays put [S: changelog 1.2.4] |

Early-boot behaviour: the dock reserves its space from the first moment after Windows starts [S: changelog 1.2.3].

Other tools can't push it around: a Windhawk mod or Command Palette no longer moves it [S: changelog 0.1.11].

## Multiple displays

| Setting | Detail |
| --- | --- |
| Displays > All | A dock on every display, each reserving its own space [S: changelog 1.2.4] |
| Displays > Follow | Hold the pointer at the bottom of another screen and the dock moves there [S: changelog 1.2.4] |
| One monitor | Remembers the chosen monitor and returns when plugged in [S: changelog 0.1.11] |
| Taskbar | Hidden on every screen with a dock; a screen without one keeps its taskbar on auto-hide [S: guides/hide-taskbar-windows-11] |

## Windows taskbar

- Choice in Settings: Auto-hide (default) or Hidden [S: home] [S: changelog 1.2.12]
- Hidden means never shown, pointer at the edge or not [S: guides/hide-taskbar-windows-11]
- Returns exactly as it was on close or quit; no Windows files change [S: docs]
- Planned: an option to leave the taskbar alone [S: roadmap]
- It doesn't patch Explorer, so it works on every Windows build [S: guides/windows-11-taskbar-top]
- A bug that the rebuild must avoid: the taskbar returning beside an auto-hiding dock [S: changelog 1.2.6]

## Fullscreen and sleep

- A fullscreen game or video hides the dock, and it returns afterwards [S: docs]
- Under fullscreen it stops drawing, so the game keeps its frames, and gives memory back [S: changelog 1.2.8, 1.2.11]
- It must not reappear over fullscreen when you click another monitor [S: changelog 1.2.9]
- After sleep the dock returns instead of leaving an empty strip [S: changelog 1.2.10]
- Glass refreshes after unlock [S: changelog 1.2.0]

## Motion

- Auto-hide slides like the taskbar, with no white flash [S: changelog 1.2.7]
- Removing or unpinning animates away; icons part to make room [S: changelog 1.0.0, 0.1.11]
- Toggles slide in and out like widgets [S: changelog 0.1.13]
- Timings are Gap G-10

## Recording

The dock doesn't blink in OBS or other screen recordings [S: changelog 1.0.1, 1.2.6].
