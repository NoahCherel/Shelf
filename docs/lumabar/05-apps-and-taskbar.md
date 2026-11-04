# 05. Apps and the taskbar's job

The Apps widget is how the dock takes over from the taskbar. It's a widget like any other, so it can be removed for use beside another dock [S: guides/lumabar-vs-mydockfinder].

## What it contains

- Start tile, the apps pinned to the Windows taskbar, and every open window [S: home]
- Pin an app in Windows and it appears in the dock [S: home]
- Pinned apps follow the taskbar; more than eight fit; Store apps pinned from Start group under one tile [S: changelog 0.1.11]
- One icon per app: a pinned Store app doesn't show a second icon when open, and several windows show on hover [S: changelog 1.2.3]
- Your own picture on the Start tile; default was the app's logo [S: changelog 0.1.6, 0.1.11]
- Icons sit bare with no tile, and a blue dot marks open apps [O: apps-dark]

## Clicks

| Action | Result | Source |
| --- | --- | --- |
| Click open app | Focus; click again to minimize | [S: changelog 1.2.13] |
| Click pinned app | Launch | [I] |
| Click Start tile | Opens Start | [S: docs] |
| Win key | Opens Start, and brings an auto-hidden dock up | [S: changelog 1.2.11] |
| Win+T | Shows open apps; arrows move between apps, Tab between windows, Enter opens | [S: changelog 1.2.0] |

## Hover

- Names above icons, can be turned off [S: changelog 1.0.0]
- Preview on hover even with one window; resting shows the window itself [S: changelog 1.2.0]
- Preview has the window's title and a close button [S: changelog 1.2.12]
- Previews can be turned off [S: changelog 1.2.6]
- Shows sooner; a right-click swaps it for the menu [S: changelog 1.2.5]

## Right-click

| Target | Menu | Source |
| --- | --- | --- |
| App | Jump list, e.g. Telegram's Quit, Brave's New window, Terminal's profiles, recent files | [S: changelog 1.2.6] |
| App tile | Unpin / Close | [S: changelog 0.1.11] |
| Open app | Pin to dock; End task | [S: changelog 1.2.5, 1.2.6] |
| Start | Windows' own quick menu, with Shut down or sign out | [S: changelog 1.2.6] |
| File Explorer | Quick access folders | [S: changelog 1.2.5] |

## Drag and drop

- Drag an app from the desktop or Explorer to pin; icons part to make room [S: changelog 1.0.0]
- Photos, videos, files and folders on the dock; a folder shows a stack [S: changelog 1.0.0]
- Move any icon along the dock; drag one off to remove it [S: changelog 1.0.0]
- Every open app can be dragged, Store apps too [S: changelog 1.1.1]
- Hold one app over another to make a group, as on an iPhone; click opens it; the name is editable [S: changelog 1.2.6]
- Drag files over an open app and it comes to the front for dropping [S: changelog 1.2.6]
- Drop files on the Trash to recycle them [S: changelog 1.2.3]
- Apps dragged from Start are pinned as apps [S: changelog 1.2.10]
- A file deleted elsewhere leaves the dock [S: changelog 1.2.10]

## Apps as separate widgets

- Any app or folder can be a widget of its own, from Apps & Files in the picker [S: changelog 1.2.6]
- The Widgets menu lists every installed app, including Start folders, pins and Office [S: changelog 1.2.10]
- Show Desktop and Microphone tiles exist, but aren't in the catalogue: G-14 [S: changelog 1.2.12, 1.2.13]

## Taskbar functions replaced

| Taskbar function | Replacement | Source |
| --- | --- | --- |
| Start, pins, windows | Apps | [S: guides/hide-taskbar-windows-11] |
| System tray | Tray tile | [S: guides/hide-taskbar-windows-11] |
| Clock | Any clock tile | [S: guides/mac-menu-bar-for-windows] |
| Input language | Language tile | [S: guides/hide-taskbar-windows-11] |
| Quick settings | Quick Toggles | [S: guides/hide-taskbar-windows-11] |
| Volume | Audio Output | [S: guides/mac-menu-bar-for-windows] |

## Bugs to avoid

| Problem | Source |
| --- | --- |
| Tray tile crashing other apps such as SourceTree | [S: changelog 1.2.13] |
| Explorer tile appearing with the desktop's menu | [S: changelog 1.2.13] |
| Notch apps showing as open windows | [S: changelog 1.2.13] |
| Restoring apps from the dock failing | [S: changelog 1.2.12] |
| Store app pins failing; generic icons for Settings and Store apps | [S: changelog 1.0.1, 1.2.12] |
| Letter tiles that open nothing | [S: changelog 1.2.10] |
| Maximized windows leaving a thin line | [S: changelog 1.2.11] |

How previews, jump lists and tray forwarding work is Gap G-21.
