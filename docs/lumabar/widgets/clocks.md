# Clocks widgets

14 widgets. Tags and the template are explained in [the README](../README.md).

### Clock

> Large, readable time with its seconds and the date, in 12- or 24-hour format. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Very large time, smaller grey seconds, AM/PM, date below [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 345×154 px in the capture, wide (2.24:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 15%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | Calendar, as any clock [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | System clock [I] |
| **Refresh** | Every second [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/clock-dark-CD_mSa7E.webp`, `_evidence/assets/clock-light-CNhUA9wY.webp` [O] |
| **Buildable here?** | Yes [I] |

### Flip Clock

> Split-flap digits that turn over every minute. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Split-flap digit cards (dark in dark, white in light), AM/PM; flip animation [O] [M: styles.css flip-fall, flip-land] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 386×154 px in the capture, wide (2.51:1) [M] |
| **Layout** | Radius 33 px, rim #f6f6f6 at 13%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 8%, fill #000000 at 4.3% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | System clock [I] |
| **Refresh** | Every minute [S: widgets] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/flip-clock-dark-4lNeod14.webp`, `_evidence/assets/flip-clock-light-B7NcHT1d.webp` [O] |
| **Buildable here?** | Yes [I] |

### World Clocks

> Three small analog faces for the cities you work with. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Three small analog faces with city codes; dark face at night [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 394×154 px in the capture, wide (2.56:1) [M] |
| **Layout** | Radius 33 px, rim #f6f6f6 at 13%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 8%, fill #000000 at 4.3% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | Cities you pick [S: changelog 0.1.7] |
| **Refresh** | Every minute [I] |
| **Setup** | Pick cities [S: changelog 0.1.7] |
| **Captures** | `_evidence/assets/world-clocks-dark-BUYicIPz.webp`, `_evidence/assets/world-clocks-light-oh2PJIuB.webp` [O] |
| **Buildable here?** | Yes [I] |

### Analog Classic

> A white analog face with a sweeping second hand. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | White face, numerals 12 3 6 9, minute ticks, dark hands, blue hour hand, red sweeping second [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 33 px, rim #fefefe at 13%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | System clock [I] |
| **Refresh** | Continuous [S: widgets] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/analog-classic-dark-BhYzrmDn.webp`, `_evidence/assets/analog-classic-light-DYI7Qjj9.webp` [O] |
| **Buildable here?** | Yes [I] |

### Analog Classic Dark

> The same classic face, in black. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Same face in black [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 13%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | System clock [I] |
| **Refresh** | Continuous [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/analog-classic-dark-dark-BrEXvK67.webp`, `_evidence/assets/analog-classic-dark-light-DCwEBjW_.webp` [O] |
| **Buildable here?** | Yes [I] |

### 7 Days

> This week as a strip of days, with today's temperature. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Month, weather top right; seven day columns with today in a blue tile [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 698×154 px in the capture, wide (4.53:1) [M] |
| **Layout** | Radius 32 px, rim #f7f7f7 at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | Date and weather [S: widgets] |
| **Refresh** | Daily [I] |
| **Setup** | City for the temperature [I] |
| **Captures** | `_evidence/assets/7-days-dark-t9PZsWZ4.webp`, `_evidence/assets/7-days-light-D8Nnl9wW.webp` [O] |
| **Buildable here?** | Yes [I] |

### World Clock

> Three cities in a list, each with its hour difference from yours. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Three rows: day or night icon, city, offset, time. A later release simplified this to city and time [O] [S: changelog 1.2.10] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 522×154 px in the capture, wide (3.39:1) [M] |
| **Layout** | Radius 33 px, rim #f5f5f5 at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | Cities you pick [S: changelog 0.1.7] |
| **Refresh** | Every minute [I] |
| **Setup** | Pick cities [S: changelog 0.1.7] |
| **Captures** | `_evidence/assets/world-clock-dark-CjeN9NdW.webp`, `_evidence/assets/world-clock-light-nnZU1Qag.webp` [O] |
| **Buildable here?** | Yes [I] |

### World Time

> One more city in big digits, with its offset. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Day or night icon, city, `Today, −3h`, large time [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 550×154 px in the capture, wide (3.57:1) [M] |
| **Layout** | Radius 32 px, rim #fefefe at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | City you pick [S: changelog 0.1.7] |
| **Refresh** | Every minute [I] |
| **Setup** | Pick a city [S: changelog 0.1.7] |
| **Captures** | `_evidence/assets/world-time-dark-BFg6268g.webp`, `_evidence/assets/world-time-light-D-aVbxXO.webp` [O] |
| **Buildable here?** | Yes [I] |

### Today

> Weekday, date, time and weather in a single tile. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Red uppercase weekday, large date, divider, time with AM/PM, weather glyph and temperature [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 476×154 px in the capture, wide (3.09:1) [M] |
| **Layout** | Radius 32 px, rim #fdfdfd at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | Clock and weather [S: widgets] |
| **Refresh** | Every minute [I] |
| **Setup** | City for the temperature [I] |
| **Captures** | `_evidence/assets/today-dark-C3ylDaxU.webp`, `_evidence/assets/today-light-BgJQbqGp.webp` [O] |
| **Buildable here?** | Yes [I] |

### Date

> The full date, set large. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Grey weekday over very large date [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 468×154 px in the capture, wide (3.04:1) [M] |
| **Layout** | Radius 32 px, rim #fefefe at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | System date [I] |
| **Refresh** | Daily [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/date-dark-YMilr7Wz.webp`, `_evidence/assets/date-light-BJf2gDpB.webp` [O] |
| **Buildable here?** | Yes [I] |

### Day Number

> Today's date as a calendar page. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Square tile, red weekday, large day [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | System date [I] |
| **Refresh** | Daily [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/day-number-dark-ChjerXI4.webp`, `_evidence/assets/day-number-light-CYNhG3rY.webp` [O] |
| **Buildable here?** | Yes [I] |

### Analog Minimal

> Hands and hour ticks on a dark face, nothing else. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Hands with amber centre and hour ticks only [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 35 px, rim #fefefe at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | System clock [I] |
| **Refresh** | Every minute [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/analog-minimal-dark-CWS2hlu8.webp`, `_evidence/assets/analog-minimal-light-DKTUspft.webp` [O] |
| **Buildable here?** | Yes [I] |

### Segment Clock

> The time as a seven-segment display, under the weekday and date. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Red outlined weekday pill, date, seven-segment digits with faint off segments [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 413×154 px in the capture, wide (2.68:1) [M] |
| **Layout** | Radius 32 px, rim #ffffff at 16%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | System clock [I] |
| **Refresh** | Every minute [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/segment-clock-dark-ByyeC8Kn.webp`, `_evidence/assets/segment-clock-light-xDZpchSe.webp` [O] |
| **Buildable here?** | Yes [I] |

### Clock & Weather

> Time, date and temperature as three colour blocks in one square tile. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Clocks [S: widgets] |
| **Tile shows** | Square of colour blocks: red top with time and small AM/PM, black bottom-left with weekday and day, grey circle with temperature [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 32 px, rim #f7330a at 100%, fill #ff2e01 at 100.0% in dark. Light: rim #fc3106 at 100%, fill #ff2e01 at 100.0% [M] |
| **Card** | Calendar [S: changelog 1.2.5] |
| **Click** | Opens Calendar [S: changelog 1.2.5] |
| **Data source** | Clock and weather [S: widgets] |
| **Refresh** | Every minute [I] |
| **Setup** | City for the temperature [I] |
| **Captures** | `_evidence/assets/clock-and-weather-dark-DhKG0pgI.webp`, `_evidence/assets/clock-and-weather-light-BmVw8c5q.webp` [O] |
| **Buildable here?** | Yes; Shelf's version had the right idea but wrong proportions [I] |
