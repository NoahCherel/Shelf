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
- [ ] Click Start: the Start menu opens, with the taskbar hidden. Click Start again: it closes, and your app keeps focus.
- [ ] Right-click an app: Windows' menu appears, and clicking away closes it. Try **Gestionnaire des tâches** and **Fermer la fenêtre**.
- [ ] Right-click Start: Windows' quick menu appears.
- [ ] Click Search, and each icon of the Status tile: the right Windows panel opens, and clicking the icon again or clicking away closes it.
- [ ] Click a widget from another app: its card opens and takes the keyboard, and clicking away closes it.
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
- [ ] **Maximize a window:** the dock should stay visible, floating over it. With **Float over windows** off, the window should stop above the dock.

## Hardware I couldn't test

- [ ] **150% display scale:** the dock should stay centred and sharp.
- [ ] **A second monitor:** Milestone 1 has one dock on the primary screen, and hides the taskbar on every screen. Multi-screen handling is Milestone 2.
- [ ] **Windows 10:** targeted, but only run on Windows 11.
- [ ] **A laptop battery:** this PC reported whichever state it has, but charging, low and draining need a real battery.

## Wi-Fi card

These change the real connection, so only the owner runs them.

- [ ] **Connect:** a saved network connects on click, and the dock's icon follows.
- [ ] **New network:** a secured network asks for its password in the row, and connects.
- [ ] **Wrong password:** a plain error on that row, and no profile left behind (`netsh wlan show profiles`).
- [ ] **Click away while connecting:** reopening shows it still connecting, or how it went.
- [ ] **Disconnect and reconnect:** Disconnect needs a second click, and the network can be rejoined.
- [ ] **Captive portal:** a café network shows "Connected, no internet".

## Quick Settings card

These change real settings, so only the owner runs them.

- [ ] **Bluetooth switch:** turns it on and off, and the state stays after reopening the card.
- [ ] **Wi-Fi switch:** turning it off drops the connection, the dock's icon follows, and it turns back on.
- [ ] **Brightness slider:** the screen follows the drag, ends on the last value, and stays there.
- [ ] **Outside monitor only:** the slider is gone and a Display link is there instead.
- [ ] **Airplane mode:** turns every radio off and back on, and Windows' own panel agrees.
- [ ] **Do not disturb:** notifications really stop, and Windows' own panel agrees.
- [ ] **Night light:** the screen's tint follows the switch.
- [ ] **Energy saver:** on battery, it turns on and off, and the level set in Windows comes back afterwards. Plugged in, it says it only runs on battery.
- [ ] **Bluetooth card:** paired devices are listed with the connected one first, and the row opens Settings.
- [ ] **Battery widget:** with it on the dock, the status tile shows the sliders icon, and clicking the widget opens Quick Settings.

## A day of use

- [ ] Does the Claude tile stay right while Claude Code runs?
- [ ] Is anything slow or noisy after several hours?
