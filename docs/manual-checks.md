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

## Search card

These launch real things, so only the owner runs them.

- [ ] **Open an app:** Enter or a click starts it, and the card closes.
- [ ] **Open a file:** a file result opens in its usual app.
- [ ] **Web:** the last row opens the browser on a search for the text.
- [ ] **Recent:** recent searches, apps and files show with an empty box, and a recent file opens.
- [ ] **Reopen:** close the card, open it, and files still come back.
- [ ] **Win+S:** still opens Windows' own search, as taking the shortcut over is out of scope.

## Window previews

These need a real pointer, and closing or switching real windows.

- [ ] **Hover:** resting on an open app shows a live picture of each window, and a video keeps playing in it.
- [ ] **Crossing:** moving from the icon up to the strip keeps it open.
- [ ] **Leaving:** moving away closes it, however fast, and it never stays stuck on screen.
- [ ] **Focus:** the app you're in keeps focus while previews show.
- [ ] **Switch:** clicking a picture brings that window forward.
- [ ] **Close:** the cross closes that window, and an unsaved document still asks first.
- [ ] **Minimized:** shows its picture, or the icon if Windows has none, and clicking restores the window.
- [ ] **Peek:** resting on a picture shows that window over the others until the pointer leaves it, and moving to the next picture follows. Afterwards, everything is back as it was.
- [ ] **Two dots:** an app with several windows shows them.
- [ ] **Click:** on several windows, a click shows them and another closes them. On one window, it brings it forward.
- [ ] **Scale:** pictures sit in their frames at 100%, 125% and 150%.

## Notifications

- [ ] **Bell:** a new notification raises the count within a few seconds.
- [ ] **Card:** each shows its app, text and age, and a new one appears while it's open.
- [ ] **Dismiss:** the cross and Clear all also clear them from Windows' own panel.
- [ ] **Open:** a click brings the notification's app forward, or starts it. Not the message itself: Windows doesn't allow more.

## Right-clicking an app

- [ ] **Menu:** the app's name, pin or unpin, End task and close, in Windows' language.
- [ ] **Pin:** pinning an open app keeps its icon after closing it, and after restarting Shelf.
- [ ] **Unpin:** unpinning takes it off the dock. It's still pinned on Windows' own taskbar, which Shelf leaves alone.
- [ ] **Close:** with several windows it reads "close all", and an unsaved document still asks first.

## A day of use

- [ ] Does the Claude tile stay right while Claude Code runs?
- [ ] Is anything slow or noisy after several hours?
