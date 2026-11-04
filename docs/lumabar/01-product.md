# 01. The product

Lumabar, the reference for the private Shelf rebuild, as of version 1.2.13 (4 November 2026).

## What it is

- A taskbar alternative for Windows 11 and 10: one live dock on the top or bottom edge, with your apps and 100+ widgets [S: llms.txt]
- Pitched as "Not a taskbar. A smart dock." Widgets share what they know and step in before you have to check [S: home]
- Its purpose is to stop you opening apps just to check things [S: about]
- It doesn't manage windows, add per-app menus, restyle windows, magnify icons or add a Launchpad [S: guides/lumabar-vs-seelen-ui] [S: guides/mac-menu-bar-for-windows] [S: guides/best-dock-for-windows-11]
- There are no skins, config files or user-written widgets; everything is set with clicks [S: guides/what-is-lumabar] [S: guides/rainmeter-alternative]

## Facts

| Item | Value |
| --- | --- |
| Stack | "A native Windows app written in Rust and React on Tauri" [S: about] |
| Windows | 11 and 10, 64-bit and 32-bit; no admin rights; changes no Windows files [S: about] [S: llms.txt] |
| Installer | MSI: 9.3 MB (64-bit), 8.1 MB (32-bit), signed, plus `latest.json` [M: GitHub release v1.2.13] [S: about] |
| Age | 30 releases between 28 September and 4 November 2026 [S: about] |
| Widgets | 103 on the widgets page in 13 categories; README still says 85 in 12 groups [M: widgets.json] [S: gh-readme.md] |
| Styles | Liquid Glass, iOS Glass, Midnight, Black, White, Clear [S: guides/what-is-lumabar] |
| Sizes | S, M, L, plus a continuous drag [S: docs] [S: changelog 1.2.9] |
| Author | One developer [S: about] |
| Price | $5.99 once, regular $15.99, 14-day refund, one PC per key [S: terms] |

**Contradiction, kept on record:** some pages say five styles (docs, README, liquid glass guide), others six (home, what-is). The difference is Clear, added in 1.1.0 [S: changelog 1.1.0].

## First run

1. Installer runs; Lumabar starts on its own and docks to the bottom [S: docs]
2. Paste the licence key and press Activate; it never reads the clipboard [S: docs]
3. Right-click the dock → Widgets… and add tiles [S: guides/what-is-lumabar]
4. Settings → Appearance for style and accent; drag up for the top edge [S: guides/what-is-lumabar]

The default first layout isn't published: Gap G-16.

## What the rebuild leaves out

These only exist because Lumabar is sold, so a private tool doesn't need them [I]:

- Licence key, activation and the Polar purchase flow [S: docs]
- Feedback form and review submission [S: feedback]
- Public update hosting, though a local update path may still be useful (G-17) [I]

## Updates and uninstall

- Checks a minute after start and every few hours; the dock offers an Update button [S: docs]
- The update downloads inside its toast with progress, and closing the toast doesn't stop it [S: changelog 1.2.0]
- The notice stays until Update or close; a closed notice waits in Settings; a What's new link is on it [S: changelog 1.2.11, 1.2.13]
- Installers refuse to run unless signed; installed copies check GitHub [S: about]
- Uninstall through Windows Settings; the taskbar returns immediately [S: docs]

## Resource claims

- The dock "idles at a fraction of a percent of CPU" [S: guides/best-desktop-widgets-windows-11]
- Widgets only run while they are on the dock [S: guides/best-desktop-widgets-windows-11]
- One reviewer reports 60 fps with no lost frames, and rest when nothing moves behind the glass [S: feedback]
- Dock shows up about 3 seconds sooner after 1.2.1, which implies startup was once slow [S: changelog 1.2.1] [I]

## Who it's for

- Founders, developers, sellers and students each get a preset showcase [S: home]
- Developers pacing AI plans; makers watching revenue; people curious where the day goes [S: guides/what-is-lumabar]

You're a developer using Claude, so the developer showcase is the nearest default [I].
