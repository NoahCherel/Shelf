# System widgets

14 widgets. Tags and the template are explained in [the README](../README.md).

### System Stats

> CPU and RAM as two live rings. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Two rings with value and label: CPU, RAM; blue on grey track [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 330×154 px in the capture, wide (2.14:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 14%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Local system counters [I] |
| **Refresh** | Live [S: widgets] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/system-stats-dark-DYA5U6vu.webp`, `_evidence/assets/system-stats-light-DQEQ3WvC.webp` [O] |
| **Buildable here?** | Yes; Shelf already reads CPU and RAM [I] |

### Tray

> Your tray icons in a grid, one click away - right-click works as in the taskbar. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Square tile with one chevron [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Tray icons in a grid; click and right-click act as in the taskbar, and the card stays open while an app's menu is up [S: changelog 1.0.1] [S: widgets] |
| **Click** | Opens the grid [S: changelog 1.0.1] |
| **Data source** | The real Windows tray icons [S: guides/hide-taskbar-windows-11] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/tray-dark-DcWR2uxI.webp`, `_evidence/assets/tray-light-BTIJnJ3N.webp` [O] |
| **Buildable here?** | Yes but hard: reading and forwarding tray icons is the riskiest shell work, and Lumabar itself crashed other apps here (1.2.13) [I] |

### Language

> The current keyboard layout; click to switch. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Square tile with bold layout code, e.g. ENG [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Full layout list [S: changelog 1.0.1] |
| **Click** | Switches layout [S: widgets] |
| **Data source** | Windows keyboard layouts [S: widgets] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/language-dark-aFiJF-sI.webp`, `_evidence/assets/language-light-BLvYo7fw.webp` [O] |
| **Buildable here?** | Yes [I] |

### Temperature

> CPU temperature as a gauge, with CPU and memory load beside it. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Green arc gauge with degrees and sensor name; CPU and RAM rows with blue bars and percent [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 455×154 px in the capture, wide (2.95:1) [M] |
| **Layout** | Radius 39 px, rim #ffffff at 13%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 8%, fill #000000 at 4.3% [M] |
| **Card** | Every sensor Windows shares, last ten minutes, CPU and memory load, °C or °F, names the actual sensor [S: changelog 1.0.0, 1.2.8, 1.2.9] |
| **Click** | Opens the card [S: changelog 1.2.9] |
| **Data source** | Windows sensor data [S: changelog 1.0.0] |
| **Refresh** | Live [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/temperature-dark-BkEtWgLe.webp`, `_evidence/assets/temperature-light-Bd5RNZ5Y.webp` [O] |
| **Buildable here?** | Maybe: CPU temperature needs a working source without admin rights; test in planning [I] |

### CPU

> Processor load as a ring. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Square tile, cyan ring, chip icon, value [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 40 px, rim #fefefe at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Local counters [I] |
| **Refresh** | Live [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/cpu-dark-BRtP9be8.webp`, `_evidence/assets/cpu-light-CgfPUXTy.webp` [O] |
| **Buildable here?** | Yes [I] |

### RAM

> Memory in use as a ring. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Square tile, blue ring, memory icon, value [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 40 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Local counters [I] |
| **Refresh** | Live [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/ram-dark-jTUjpVEV.webp`, `_evidence/assets/ram-light-ByN-EEt3.webp` [O] |
| **Buildable here?** | Yes [I] |

### Network

> Download and upload speed with a live chart. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Blue down arrow and speed, purple up arrow and speed, two-colour live line [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 456×154 px in the capture, wide (2.96:1) [M] |
| **Layout** | Radius 39 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Local counters [I] |
| **Refresh** | Smooth scrolling graph [S: changelog 0.1.11] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/network-dark-DUkjwfvY.webp`, `_evidence/assets/network-light-QB3MJNu8.webp` [O] |
| **Buildable here?** | Yes [I] |

### Battery

> Charge level as a filling gauge, with the charging state. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Square water tile: cyan-to-blue fill with a wave top, bolt when charging, percent; bubbles and wave animate [O] [M: styles.css lb-wave, lb-bubble] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 14%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Windows power status [I]; fills by charge level [S: changelog 0.1.8] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/battery-dark-09rBvfw7.webp`, `_evidence/assets/battery-light-M_iYmOH3.webp` [O] |
| **Buildable here?** | Yes; refine Shelf's version with real animation [I] |

### Quick Toggles

> Wi-Fi, Bluetooth, mobile hotspot and airplane mode. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Wi-Fi pill (active blue) and Bluetooth pill, each with chevron and divider; round hotspot and airplane buttons; you choose which appear [O] [S: changelog 0.1.13] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 668×154 px in the capture, wide (4.34:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 14%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | Wi-Fi shows online state; Bluetooth card lists device batteries; also Ethernet, Energy saver, Do not disturb, Microphone, Camera, Keep Awake, Desktop Icons, Display Mode [S: changelog 0.1.8, 0.1.14, 1.2.0, 1.2.8] |
| **Click** | Toggles; chevron opens detail [O] [I] |
| **Data source** | Windows radio and system APIs [I] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/quick-toggles-dark-gkh1l3Km.webp`, `_evidence/assets/quick-toggles-light-Dhz_YgBN.webp` [O] |
| **Buildable here?** | Partly: each toggle needs checking without admin rights [I] |

### Brightness

> A slider for the display's brightness. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Sun icon, label, percent, thick white slider with round knob; follows the accent [O] [S: changelog 0.1.8] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 550×154 px in the capture, wide (3.57:1) [M] |
| **Layout** | Radius 39 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #181818 at 100%, fill #242424 at 100.0% [M] |
| **Card** | Display mode controls [S: changelog 0.1.7] |
| **Click** | Drag to change [S: widgets] |
| **Data source** | Windows display brightness [I] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/brightness-dark-UA10YA5a.webp`, `_evidence/assets/brightness-light-BYl_Nixr.webp` [O] |
| **Buildable here?** | Yes on laptops; external monitors need DDC/CI, untested [I] |

### Theme Toggle

> Switch Windows between light and dark mode. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Pill with sun and moon, active side raised [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 172×154 px in the capture, wide (1.12:1) [M] |
| **Layout** | Radius 39 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | None seen |
| **Click** | Switches Windows between light and dark [S: widgets] |
| **Data source** | Windows light and dark setting [S: widgets] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/theme-toggle-dark-D_Opiur7.webp`, `_evidence/assets/theme-toggle-light-CGh1rWyh.webp` [O] |
| **Buildable here?** | Yes [I] |

### Month Progress

> How much of the month is behind you. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Three rows of dots filling up, month label, percent [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 318×154 px in the capture, wide (2.06:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 17%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | None seen |
| **Click** | Gap (G-04) |
| **Data source** | Date [I] |
| **Refresh** | Daily [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/month-progress-dark-BOw5t01y.webp`, `_evidence/assets/month-progress-light-Dtv38cWf.webp` [O] |
| **Buildable here?** | Yes [I] |

### Day Progress

> How much of today is behind you. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Large dots filling up, date, percent [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 368×154 px in the capture, wide (2.39:1) [M] |
| **Layout** | Radius 37 px, rim #fdfdfd at 17%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | None seen |
| **Click** | Gap (G-04) |
| **Data source** | Time of day [I] |
| **Refresh** | Periodic [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/day-progress-dark-DkiXb4Zp.webp`, `_evidence/assets/day-progress-light-BeuIKC6m.webp` [O] |
| **Buildable here?** | Yes [I] |

### Year Progress

> The year as a grid of dots, filling up. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | System [S: widgets] |
| **Tile shows** | Grid of dots filling up, year, percent [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 364×154 px in the capture, wide (2.36:1) [M] |
| **Layout** | Radius 37 px, rim #ffffff at 17%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | None seen |
| **Click** | Gap (G-04) |
| **Data source** | Date [I] |
| **Refresh** | Daily [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/year-progress-dark-BcPFPBKd.webp`, `_evidence/assets/year-progress-light-BtGqTrKo.webp` [O] |
| **Buildable here?** | Yes [I] |
