# Media & Audio widgets

5 widgets. Tags and the template are explained in [the README](../README.md).

### Now Playing

| Field | Detail |
| --- | --- |
| **Category** | Media & Audio [S: widgets] |
| **Tile shows** | Cover art, title, artist, previous, blue play and next buttons, blue progress along the bottom edge; app icon when no cover; playing animation [O] [S: changelog 1.0.0] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 836×154 px in the capture, wide (5.43:1) [M] |
| **Layout** | Radius 32 px, rim #fefefe at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Buttons control playback [S: widgets] |
| **Data source** | Windows media session [I] |
| **Refresh** | Live [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/now-playing-dark-M942okn2.webp`, `_evidence/assets/now-playing-light-DO2incLC.webp` [O] |
| **Buildable here?** | Yes; Shelf has transport control. Art and progress need adding [I] |

### Audio Output

| Field | Detail |
| --- | --- |
| **Category** | Media & Audio [S: widgets] |
| **Tile shows** | Speaker icon, device name, percent, blue slider with knob [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 550×154 px in the capture, wide (3.57:1) [M] |
| **Layout** | Radius 32 px, rim #ffffff at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | iOS-style volume, each app's volume, outputs as a checklist [S: changelog 1.2.8, 1.2.10] |
| **Click** | Scroll changes volume; click opens the mixer [S: changelog 0.1.14, 1.2.8] |
| **Data source** | Windows audio APIs [I] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/audio-output-dark-ChnnRtc_.webp`, `_evidence/assets/audio-output-light-CvdMirAT.webp` [O] |
| **Buildable here?** | Yes [I] |

### Now Playing (compact)

| Field | Detail |
| --- | --- |
| **Category** | Media & Audio [S: widgets] |
| **Tile shows** | Cover art, title, artist, one round play button [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 698×154 px in the capture, wide (4.53:1) [M] |
| **Layout** | Radius 38 px, rim #fefefe at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Play and pause [S: widgets] |
| **Data source** | Windows media session [I] |
| **Refresh** | Live [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/now-playing-2-dark-pSGr1PmM.webp`, `_evidence/assets/now-playing-2-light-t2e9VxJS.webp` [O] |
| **Buildable here?** | Yes [I] |

### Now Playing Mini

| Field | Detail |
| --- | --- |
| **Category** | Media & Audio [S: widgets] |
| **Tile shows** | Square tile with a progress ring around a play button [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 39 px, rim #fefefe at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Play and pause [S: widgets] |
| **Data source** | Windows media session [I] |
| **Refresh** | Live [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/now-playing-mini-dark-vdrAl0At.webp`, `_evidence/assets/now-playing-mini-light-CyFYWoTc.webp` [O] |
| **Buildable here?** | Yes [I] |

### Now Playing Bar

| Field | Detail |
| --- | --- |
| **Category** | Media & Audio [S: widgets] |
| **Tile shows** | Cover art, title, artist, progress line, play and skip [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 744×154 px in the capture, wide (4.83:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 14%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Play and skip [S: widgets] |
| **Data source** | Windows media session [I] |
| **Refresh** | Live [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/now-playing-bar-dark-B4Miv7yR.webp`, `_evidence/assets/now-playing-bar-light-CJmgTJXq.webp` [O] |
| **Buildable here?** | Yes [I] |
