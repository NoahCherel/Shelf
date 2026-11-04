# Checks only you can do

Everything else was run on your PC by script, through Shelf's own pages and without moving your real mouse. These need real input, real hardware or a real day of use.

Run Shelf from `src-tauri\target\release\shelf.exe`.

**If anything goes wrong:** `shelf.exe --quit` closes it normally, and `shelf.exe --restore-taskbar` brings the taskbar back if it's ever stuck. A forced kill also restores it within a few seconds.

## First look

- [ ] **Liquid Glass on your wallpaper:** does the bend at the rounded ends look like the reference? This is the biggest open question, as I could only judge it on test scenes and one wallpaper.
- [ ] **Text:** is it sharp at your 125% scale?
- [ ] **Light mode:** switch Windows to light and check tiles stay readable. The shader's light tint has never been seen on a real wallpaper.

## Real clicks

- [ ] Left-click an app: it focuses. Click again: it minimizes. Click a closed pinned app: it launches.
- [ ] Click Start: the Start menu opens, with the taskbar hidden.
- [ ] Click a tile, then click elsewhere: the card closes. Click the same tile twice: it opens, then closes.
- [ ] Right-click the dock: the menu appears. Try Lock dock, then try dragging a widget.
- [ ] Drag a widget along the dock with the real mouse.
- [ ] Open Widgets…, drag its window by the header, and scroll it.

## Connecting accounts

- [ ] **GitHub:** click the tile, enter your username.
- [ ] **Stripe:** click the tile, paste a restricted key. A wrong key should explain itself in plain words.
- [ ] **Weather:** click a clock, add your city.

## Shell events

- [ ] **Sleep:** put the PC to sleep and wake it. The dock should be in place, with no taskbar and no empty strip.
- [ ] **Lock:** lock and unlock. The glass should pick up the desktop again.
- [ ] **Explorer restart:** run `taskkill /f /im explorer.exe` then `start explorer`. The taskbar should stay hidden, and the edge stay reserved.
- [ ] **Fullscreen:** play a fullscreen video or game. The dock should disappear, and come back afterwards.
- [ ] **Maximize a window:** it should stop above the dock.

## Hardware I couldn't test

- [ ] **150% display scale:** the dock should stay centred and sharp.
- [ ] **A second monitor:** Milestone 1 has one dock on the primary screen, and hides the taskbar on every screen. Multi-screen handling is Milestone 2.
- [ ] **Windows 10:** targeted, but only run on Windows 11.
- [ ] **A laptop battery:** this PC reported whichever state it has, but charging, low and draining need a real battery.

## A day of use

- [ ] Does the Claude tile stay right while Claude Code runs?
- [ ] Is anything slow or noisy after several hours?
