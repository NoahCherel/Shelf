# 16. What Shelf's panels can do on Windows

Read-only probes on the owner's PC, 2026-11-05, from an unpackaged process. They changed no setting, and recorded counts rather than names [M].

## Results

| Probe | Result | Verdict |
|---|---|---|
| App volumes | 2 sessions, volume readable on both, 1 with its own process and 1 system sounds | **Build** |
| Outputs | 1 active device, friendly name readable | **Build** |
| Network list | 13 networks after a scan, 12 named, 1 with a saved profile. Only 2 before a scan, so the card has to scan first | **Build** |
| Location permission | Not refused here: code 0. Other PCs may differ, so the card keeps a plain state for it | **Build the state** |
| Radios | Wi-Fi on and Bluetooth off both readable, no prompt | **Build** |
| Brightness | PowerShell reads WMI's brightness, and the set method's class is reachable from Rust. A plain Rust query got 0 rows, probably needing `CoSetProxyBlanket` | **Build in Task 7**, falling back to a Settings link |
| Apps | 241 apps with names, in about 1.1 s | **Build**, listing them ahead of time as it's too slow to do on opening |
| Files | `search-ms:` from Rust returned nothing in 38 ms. `ISearchFolderItemFactory` with a name condition, retried in Task 8, found real files in 0.4 to 1.4 s | **Build** |
| Notifications | `GetAccessStatus` reports allowed | **Possible.** Reading them is untested, so this is a follow-up plan, not this one |

## What has no public API

| Feature | Ruling |
|---|---|
| Switching the default output | **Build,** hand-declaring the undocumented `IPolicyConfig`, as the device list works. It's widely used, though an update could break it, so a failure shows a Settings link |
| Airplane mode | **Link to Settings** |
| Do not disturb | **Link to Settings** |
| Night light | **Link to Settings** |
| Energy saver | **Link to Settings** |

No dead switches: what can't be built is a link that says where it goes.

**Revised the same day, at the owner's request.** "No public API" turned out to be too cautious a reason not to build these, and all four read correctly on this PC, so they're now real switches. Each falls back to its Settings link if an update breaks the read.

| Feature | How | Checked here |
|---|---|---|
| Airplane mode | Undocumented `IRadioManager`, behind Windows' own button | Read only: scripted radio changes are off limits |
| Do not disturb | Undocumented WNF state `0x0d83063ea3bf1c75` | Written and restored. Whether notifications really stop is a manual check |
| Night light | Undocumented registry state: byte 18, two extra bytes, and the time at bytes 10 to 14 | Written both ways, and an off stayed off for 30 s. Whether the screen's tint follows is a manual check |
| Energy saver | Public read. Writes set the battery level it starts at to 100, and keep the old level to restore | Level read as 30. The write hasn't run: this PC was plugged in, where it refuses |

Connecting a Bluetooth device still has no public way, so that stays in Settings.

## What Shelf costs

Measured on this PC, 2026-11-05, with the owner's layout and the battery charging [M]. Readings vary with what else is on screen.

| | Before | After |
|---|---|---|
| CPU at rest, share of the machine | 1.05% | 0.39 to 0.56% |
| Private memory | 289 MB | 272 to 286 MB |

The CPU was the battery widget's water, redrawing the dock at the screen's rate, so it now moves 8 times a second. Moving it 12 times a second saved little, and 6 was as cheap as still.

Memory has a floor: Shelf, WebView2's main, network, storage and crash processes come to 88 MB before anything is drawn. The GPU process is 80 to 110 MB and the renderers 70 MB. Sharing a renderer between windows is on. Two more savings were left out: making the card and preview windows only when used (about 28 MB, slower to open, and a risk to focus and peek), and running the GPU inside the main process (about 34 MB, but a driver reset would take the dock with it). 80 MB would mean leaving WebView2.

## Limits

One PC, one run, with one output and few audio sessions. The owner's Bluetooth is off, so nothing here shows how paired devices behave.
