# Apps & Files widgets

9 widgets. Tags and the template are explained in [the README](../README.md).

### Apps

| Field | Detail |
| --- | --- |
| **Category** | Apps & Files [S: widgets] |
| **Tile shows** | Bare icons in a row with no tile: Start tile, pinned apps, open windows; blue dots mark open; folder stacks [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 836×154 px in the capture, wide (5.43:1) [M] |
| **Layout** | Radius 18 px, rim #000000 at 0%, fill #000000 at 0.0% in dark. Light: rim #000000 at 0%, fill #000000 at 100.0% [M] |
| **Card** | Hover: names, previews with title and close, the window itself on rest. Right-click: jump list, Unpin, Close, Pin to dock, End task. Start right-click is Windows' quick menu; File Explorer lists Quick access [S: changelog 1.0.0, 1.2.0, 1.2.5, 1.2.6, 1.2.12, 1.2.13] |
| **Click** | Focus, or minimize if active; pinned launches [S: changelog 1.2.13] |
| **Data source** | Taskbar pins, all windows, jump lists; groups by holding one app on another; drag files over apps; drag to pin [S: home] [S: changelog 1.0.0, 1.2.6] |
| **Refresh** | Live [I] |
| **Setup** | None [S: home] |
| **Captures** | `_evidence/assets/apps-dark-Bqfokglp.webp`, `_evidence/assets/apps-light-C2Nf0CeD.webp` [O] |
| **Buildable here?** | Yes, large: the biggest widget. Live previews, jump lists and Store app handling each need work [I] |

### Recently Opened

| Field | Detail |
| --- | --- |
| **Category** | Apps & Files [S: widgets] |
| **Tile shows** | History icon and recent app or file icons [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 270×154 px in the capture, wide (1.75:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 14%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Opens the item [I] |
| **Data source** | Windows recent items [I] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/recently-opened-dark-CyiIuwNO.webp`, `_evidence/assets/recently-opened-light-SWfgGzJy.webp` [O] |
| **Buildable here?** | Yes [I] |

### Recycle Bin

| Field | Detail |
| --- | --- |
| **Category** | Apps & Files [S: widgets] |
| **Tile shows** | Round tile with bin icon; turns red with a count badge when full [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 14%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | What the bin holds; click to empty; drop files to recycle; fills up [S: widgets] [S: changelog 1.2.3] |
| **Click** | Opens contents [S: widgets] |
| **Data source** | Windows Recycle Bin [I] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/recycle-bin-dark-CHcAt_JV.webp`, `_evidence/assets/recycle-bin-light-kAUM8b-P.webp` [O] |
| **Buildable here?** | Yes [I] |

### Search

| Field | Detail |
| --- | --- |
| **Category** | Apps & Files [S: widgets] |
| **Tile shows** | Magnifier, `Search or open` [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 561×154 px in the capture, wide (3.64:1) [M] |
| **Layout** | Radius 33 px, rim #fefefe at 16%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Field only seen |
| **Click** | Focus field [I] |
| **Data source** | Web search, or a folder path opens it [S: widgets] |
| **Refresh** | n/a |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/search-dark-BLbin3Yl.webp`, `_evidence/assets/search-light-Bt8LHi3R.webp` [O] |
| **Buildable here?** | Yes; needs a focusable dock window [I] |

### Commands

| Field | Detail |
| --- | --- |
| **Category** | Apps & Files [S: widgets] |
| **Tile shows** | Green prompt, monospace `command` [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 582×154 px in the capture, wide (3.78:1) [M] |
| **Layout** | Radius 33 px, rim #fefefe at 16%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Field only seen |
| **Click** | Focus field [I] |
| **Data source** | Word launches an app or an action [S: widgets] |
| **Refresh** | n/a |
| **Setup** | Gap (G-04) |
| **Captures** | `_evidence/assets/commands-dark-BjurGawO.webp`, `_evidence/assets/commands-light-7nV3pxSs.webp` [O] |
| **Buildable here?** | Yes; command list is a Gap [I] |

### Storage

| Field | Detail |
| --- | --- |
| **Category** | Apps & Files [S: widgets] |
| **Tile shows** | Red drive icon, `Storage`, used percent, free GB, `free of`, red bar; can show `Full in N days` [O] [S: changelog 1.2.11] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 394×154 px in the capture, wide (2.56:1) [M] |
| **Layout** | Radius 33 px, rim #f8f8f8 at 13%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 8%, fill #000000 at 4.3% [M] |
| **Card** | Switch drives at top, see what takes the space [S: changelog 1.2.8, 1.2.10] |
| **Click** | Opens the card [S: changelog 1.2.10] |
| **Data source** | Windows volumes; folder analysis [S: changelog 1.2.10] |
| **Refresh** | Periodic [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/storage-dark-DOWDrg8n.webp`, `_evidence/assets/storage-light-CpSLXISE.webp` [O] |
| **Buildable here?** | Yes; space analysis takes extra work [I] |

### Recent Screenshots

| Field | Detail |
| --- | --- |
| **Category** | Apps & Files [S: widgets] |
| **Tile shows** | Three thumbnails [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 474×154 px in the capture, wide (3.08:1) [M] |
| **Layout** | Radius 33 px, rim #ffffff at 12%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 8%, fill #000000 at 4.3% [M] |
| **Card** | Text from screenshots [S: changelog 1.1.0] |
| **Click** | Opens the image [I] |
| **Data source** | Screenshots folder [I] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/recent-screenshots-dark-BCgNxEos.webp`, `_evidence/assets/recent-screenshots-light-BncTFESI.webp` [O] |
| **Buildable here?** | Yes; text recognition can use Windows OCR [I] |

### Downloads

| Field | Detail |
| --- | --- |
| **Category** | Apps & Files [S: widgets] |
| **Tile shows** | Blue arrow icon, `DOWNLOADS`, file name, date and size [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 532×154 px in the capture, wide (3.45:1) [M] |
| **Layout** | Radius 32 px, rim #f6f6f6 at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | None seen |
| **Click** | Opens the file [S: widgets] |
| **Data source** | Downloads folder, latest file [S: widgets] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/downloads-dark-DuGJafbC.webp`, `_evidence/assets/downloads-light-D1pKr3am.webp` [O] |
| **Buildable here?** | Yes [I] |

### Screenshot Capture

| Field | Detail |
| --- | --- |
| **Category** | Apps & Files [S: widgets] |
| **Tile shows** | Three round buttons: blue window, green crop, purple screen [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 352×154 px in the capture, wide (2.29:1) [M] |
| **Layout** | Radius 32 px, rim #f8f8f8 at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | None seen |
| **Click** | Starts that capture [I] |
| **Data source** | Captures screen, window (exact, rounded corners) or region [S: widgets] [S: changelog 1.1.1] |
| **Refresh** | n/a |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/screenshot-capture-dark-DTtBwaq7.webp`, `_evidence/assets/screenshot-capture-light-BFSnDf_z.webp` [O] |
| **Buildable here?** | Yes [I] |
