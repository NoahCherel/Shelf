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

- [x] **Every time:** each right-click shows the right app's menu, including when switching from one app to another (confirmed by the owner, 2026-11-06).
- [ ] **Focus taken:** when another app takes the focus as the menu opens, the menu stays, and the next click outside it closes it.
- [ ] **Menu:** the app's icon and name, pin or unpin, and close, in Windows' language, looking like Windows' own.
- [ ] **Pin:** pinning an open app keeps its icon after closing it, and after restarting Shelf.
- [ ] **Unpin:** unpinning takes it off the dock. It's still pinned on Windows' own taskbar, which Shelf leaves alone.
- [ ] **Close:** with several windows it reads "close all", and an unsaved document still asks first.

## Hidden icons

- [ ] **Open:** the chevron opens Windows' own grid right above it, in both taskbar modes, and it doesn't jump into place too visibly.
- [ ] **Icons:** clicking and right-clicking an icon does what it does on Windows.
- [ ] **Close:** clicking the chevron again, or anywhere else, closes it, and it doesn't reopen by itself.
- [ ] **Taskbar:** it never appears while doing this.
- [ ] **Focus:** after closing, the app you were in has the focus again.
- [ ] **No hidden icons:** with every icon set to show, nothing surprising opens. Windows has no chevron then, so its shortcut lands on the first icon.

## A new app arriving

- [ ] **Smooth:** a new app opens up and fades in, with the rest of the dock following.
- [ ] **Edge:** the bar's right edge doesn't visibly clip as it grows.
- [ ] **Starting Shelf:** nothing animates at launch.
- [ ] **Closing:** an app's icon folds away where it was, and a pinned app's icon stays.
- [ ] **Reopening at once:** opening the app again as it folds leaves one icon, not two.

## Where the dock sits

- [ ] **To the top:** dragging the dock by an empty spot moves it, and letting go in the top half keeps it there after a restart.
- [ ] **Locked:** with Lock dock on, dragging an empty spot does nothing, until the picker is open.
- [ ] **Below it:** at the top, cards, menus, previews and the hidden icons open below the dock, and none runs off the screen.
- [ ] **Start:** Windows' Start menu likely still opens at the bottom. Say whether that bothers you.
- [ ] **Full width:** the dock spans the whole edge, right on it, with the widgets in the middle, and its glass doesn't bend at the two ends.
- [ ] **Spacing:** the slider changes the space between widgets, and the default looks as before.

- [ ] **Previews at the top:** below a top dock, moving onto an app's previews keeps them open.
- [ ] **Anywhere:** at full width, dragging a widget puts it exactly where it's let go, it stays there after a restart, and neighbours only step aside when they'd overlap.
- [ ] **Switching width:** going from full width to pill and back keeps the dock showing.
- [ ] **Clear all:** in the notifications card, it removes every notification.
- [ ] **Narrow:** pulling an end of the pill narrows it, the rest scrolls with the wheel or a swipe, and a double-click on an end brings it back.
- [ ] **Volume:** over a narrowed dock, the wheel on the sound icon still sets the volume.

## Styles

- [ ] **iOS Glass:** like Liquid Glass with a deeper tint, and switching between the two is instant.
- [ ] **Midnight:** deep black with a fine rim, dark in light mode too.
- [ ] **White:** solid white with readable dark text, in both modes.
- [ ] **Clear:** no bar, and each widget and the apps stand out in frosted, black or white. Gaps between widgets still catch clicks, which don't reach the app behind.
- [ ] **Accent:** your own colour applies everywhere the nine do.

## Dragging apps

- [ ] **Along:** an app's icon drags along the dock and stays where it's let go, after a restart too.
- [ ] **Off:** pulling a pinned app well above or below the dock fades it, and letting go unpins it. An open app that isn't pinned goes back. Not tried with a real pointer: the dock's window is only as tall as the bar.
- [ ] **No click:** letting go of a drag doesn't open the app or its previews.
- [ ] **Dropping a program:** a .exe or a shortcut dragged from the desktop or File Explorer onto the dock pins it. Dragging from Start may give nothing to pin.
- [ ] **Widgets:** a widget added from the picker opens up, and one removed folds away where it was.

## Jump lists and names

- [ ] **Jump lists:** right-clicking Firefox or Edge shows its frequent sites or recent files and its tasks above its own items, and choosing one does what it says.
- [ ] **File Explorer:** its menu shows quick access, and a folder opens.
- [ ] **No list:** Discord, Orca and others that publish none keep the usual menu.
- [ ] **Names:** resting on an app that isn't open shows its name in a bubble, and on an open one with previews turned off.
- [ ] **Switches:** Names on hover and Window previews, in Settings, turn each off.

## Auto-hide

- [ ] **Leaving:** with nothing in use, the dock slides away smoothly after a moment, with no flash.
- [ ] **Coming back:** touching the edge with the pointer, anywhere along it, brings it back, and so does the Windows key.
- [ ] **Staying:** it stays up while a card, a menu, previews, the hidden icons, Start, the picker or Settings is open.
- [ ] **Fullscreen:** in a game or a video, touching the edge never brings it back.
- [ ] **Taskbar:** with auto-hide on, Windows' taskbar never comes up beside it, even in its Auto-hide mode.
- [ ] **Desktop:** with Stay up on the desktop on, it stays up while no app is in front.
- [ ] **Sleep:** after sleep or unlocking, a hidden dock stays hidden until you call it.

## Files, folders and groups

- [ ] **Keeping a file:** a file or a folder dropped on an empty part of the dock stays there, and comes back after a restart.
- [ ] **On an icon:** a file dropped on an app icon is not kept, and nothing else happens.
- [ ] **Bringing forward:** a file held over an open app for under a second brings that app to the front.
- [ ] **Stack:** clicking a folder lists what it holds, folders first; a line opens the right thing.
- [ ] **Making a group:** an app held over another for under a second lights that one up, and letting go makes a group. A quick drag still only reorders.
- [ ] **Group card:** clicking a group shows its apps, each opens, and its name can be edited.
- [ ] **Leaving:** right-clicking an app in a group offers to take it out; a group left with one app comes undone.
- [ ] **Deleted elsewhere:** a file deleted in File Explorer leaves the dock.
- [ ] **Adding, live:** something dragged over the dock opens a place between the icons with its picture and an Add to dock bubble, and lands there.
- [ ] **Opening in an app:** a file held at the middle of an app icon offers Open in that app, and letting go opens it there. Try a store app too.
- [ ] **Removing, live:** an app pulled off the dock folds away with a Remove from dock bubble, and comes back if brought back before letting go.

## App and folder widgets, Start image

- [ ] **App:** an app added from the picker opens from its tile, shows a dot while open, and survives a restart.
- [ ] **Folder:** Add a folder opens the Windows dialog over the picker, and the tile opens that folder.
- [ ] **Gone:** a deleted folder leaves the dock within a minute.
- [ ] **Start image:** Choose puts your picture on Start, cropped square; Use logo brings the logo back.

## Screenshots

- [ ] **Show in screenshots:** with it on, the dock appears in a Win+Shift+S capture and in screen sharing, on a solid background. With it off, the glass comes back and the dock leaves captures.

## Screens

- [ ] **Pick a screen:** with a second screen plugged in, Settings › Dock › Screen lists both, the main one marked "(main)". Pick the other one: the dock, its glass and its cards move there, and the Windows taskbar comes back on the screen the dock left, sliding away by itself.
- [ ] **Unplug it, then plug it back:** the dock waits on the main screen meanwhile, Screen shows "Unplugged screen", and the dock goes back once it's plugged in again.
- [ ] **Two scales:** with one screen at 100 % and the other at 125 % or 150 %, the dock has the right size on each, and so do the cards and previews opened from it.
- [ ] **Drag the dock on the second screen:** let it go in the top half, then the bottom half, then near each end: it settles on that screen's edge, where you let it go.
- [ ] **Follow pointer:** choose it, then hold the pointer half a second at the bottom of the other screen: the dock moves there. Passing through the edge on the way elsewhere doesn't move it, and nothing moves during a game or a drag.

## Starting with Windows

- [ ] **How soon the edge is reserved (F-023):** turn Float over windows off, run `setx SHELF_DIAG 1` once, restart Windows, then open `diag.log` beside Shelf's data. Its "edge reserved" line gives three numbers: sign-in to Shelf starting, starting to setup, setup to reserving. The correction depends on which one is long; send me the line. Then `setx SHELF_DIAG ""` turns the trace off again.

## A day of use

- [ ] Does the Claude tile stay right while Claude Code runs?
- [ ] Is anything slow or noisy after several hours?
