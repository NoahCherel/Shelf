# Productivity widgets

9 widgets. Tags and the template are explained in [the README](../README.md).

### Day Timeline

> Your whole day on one line: hours by kind of app, focus rounds, meetings, sunrise and sunset. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Productivity [S: widgets] |
| **Tile shows** | Date, `6h 5m on the PC · 4 rounds` in red; hours as coloured stacked bars by kind of app, red focus rounds beneath, dots for meetings, sunrise and sunset, a now marker [O] [S: widgets] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 803×154 px in the capture, wide (5.21:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Screen Time data, Pomodoro rounds, Calendar events and sun times combined locally [I] |
| **Refresh** | Gap (G-03) |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/day-timeline-dark-B-IfwlIV.webp`, `_evidence/assets/day-timeline-light-DXMCqy5q.webp` [O] |
| **Buildable here?** | Yes, after Screen Time, Pomodoro, Calendar and Weather exist; app-kind classification needs defining [I] |

### Screen Time

> Today's time in front of the PC, hour by hour - and every app's, by day and by week. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Productivity [S: widgets] |
| **Tile shows** | Blue watch icon, label, large total, thin bar per hour; can show a pinned app instead [O] [S: guides/screen-time-windows] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 571×154 px in the capture, wide (3.71:1) [M] |
| **Layout** | Radius 33 px, rim #fefefe at 16%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Day and Week tabs; total against yesterday; hourly chart; Most used list with Apps and Websites tabs, pin button; Longest focus, App switches, First use; Daily summary time and switch [O: screen-time-preview] |
| **Click** | Opens the card [S: guides/screen-time-windows] |
| **Data source** | Foreground app tracked locally for 90 days; stops after 5 idle minutes unless fullscreen media plays; locked PC, desktop, Start and Alt+Tab never count; websites optional, name only [S: guides/screen-time-windows] |
| **Refresh** | Live while counting [I] |
| **Setup** | None; starts counting when added [S: guides/screen-time-windows] |
| **Captures** | `_evidence/assets/screen-time-dark-DfiLLmJZ.webp`, `_evidence/assets/screen-time-light-GQV92w85.webp` [O] |
| **Buildable here?** | Yes. Website names need a method for reading browser titles (changelog 1.2.9 implies titles) [I] |

### Pomodoro

> Focus rounds and breaks you start and skip from the bar. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Productivity [S: widgets] |
| **Tile shows** | Thick red outline, `Focus` in red, `1/4` rounds, large countdown, skip button, red play button [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 486×154 px in the capture, wide (3.16:1) [M] |
| **Layout** | Radius 34 px, rim #f8483f at 100%, fill #ff7b72 at 69.8% in dark. Light: rim #5b2c27 at 100%, fill #2a0f0f at 100.0% [M] |
| **Card** | Gap (G-04) |
| **Click** | Buttons start and skip from the bar [S: widgets]; tile click Gap (G-04) |
| **Data source** | Local timer [I] |
| **Refresh** | Every second while running [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/pomodoro-dark-IHccaQMG.webp`, `_evidence/assets/pomodoro-light-Bh7CzEqL.webp` [O] |
| **Buildable here?** | Yes [I] |

### Timer

> A countdown that starts in one click. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Productivity [S: widgets] |
| **Tile shows** | Thick blue outline, `Timer` in blue, large time, blue play button [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 458×154 px in the capture, wide (2.97:1) [M] |
| **Layout** | Radius 34 px, rim #0b82f2 at 100%, fill #52aeff at 69.8% in dark. Light: rim #0e88fe at 100%, fill #0059b7 at 69.4% [M] |
| **Card** | Hours, minutes and seconds entry; keeps your own lengths [S: changelog 1.2.6] |
| **Click** | Starts in one click [S: widgets] |
| **Data source** | Local timer; can play a chosen alert tone [S: changelog 0.1.11] |
| **Refresh** | Every second while running [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/timer-dark-JcKlRnTf.webp`, `_evidence/assets/timer-light-CsqyoMX6.webp` [O] |
| **Buildable here?** | Yes [I] |

### Stopwatch

> Start, pause and lap from the bar; the card keeps every lap. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Productivity [S: widgets] |
| **Tile shows** | `Stopwatch` in orange, large time, orange play button [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 484×154 px in the capture, wide (3.14:1) [M] |
| **Layout** | Radius 35 px, rim #ffffff at 16%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Keeps every lap [S: widgets] |
| **Click** | Start, pause and lap from the bar [S: widgets] |
| **Data source** | Local timer [I] |
| **Refresh** | A review reports 60 fps [S: feedback] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/stopwatch-dark-6bQnN8xU.webp`, `_evidence/assets/stopwatch-light-CwOykr30.webp` [O] |
| **Buildable here?** | Yes [I] |

### Todos

> Your next open task with a progress ring; tick it off from the dock. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Productivity [S: widgets] |
| **Tile shows** | Blue progress ring with open count, a tick circle and the next task; the picker shows two tasks [O] [O: widgets-preview] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 550×154 px in the capture, wide (3.57:1) [M] |
| **Layout** | Radius 35 px, rim #fefefe at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | To-do list; Alt+T opens it from anywhere [S: changelog 0.1.14] |
| **Click** | Tick from the dock [S: widgets]; opens the list [S: changelog 1.2.11] |
| **Data source** | Stored locally [S: privacy]; review requests can become to-dos [S: changelog 1.1.0] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/todos-dark-_75p39xT.webp`, `_evidence/assets/todos-light-C5d6eOul.webp` [O] |
| **Buildable here?** | Yes [I] |

### Notes

> Your latest note, one click from editing. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Productivity [S: widgets] |
| **Tile shows** | Yellow-topped notepad icon, title of the last note, two lines of preview, edit button [O] [S: changelog 1.2.9] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 550×154 px in the capture, wide (3.57:1) [M] |
| **Layout** | Radius 32 px, rim #fefefe at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Note editor [S: widgets] |
| **Click** | One click to editing [S: widgets] |
| **Data source** | Stored locally [S: privacy] |
| **Refresh** | On change [I] |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/notes-dark-qfoJAjhW.webp`, `_evidence/assets/notes-light-CwehbMn0.webp` [O] |
| **Buildable here?** | Yes [I] |

### Calendar

> Your next event and how soon it starts. Google, Outlook and iCloud events sit next to renewals and payouts. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Productivity [S: widgets] |
| **Tile shows** | Date tile (red weekday, day), event icon and title, `4:05 PM · in 23 min`, small source icons; empty state `No upcoming events · Click to plan your day` [O] [O: widgets-preview] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 614×154 px in the capture, wide (3.99:1) [M] |
| **Layout** | Radius 34 px, rim #fffdff at 15%, fill #fffeff at 5.5% in dark. Light: rim #020002 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Month grid with per-day logos, +N overflow and category dots; legend Renewals, Payouts, Events, All day, Due dates, Limit resets; Calendars, Today, arrows; day list; quick-add with time (N) [O: calendar-dark-1560] [S: changelog 1.1.1] |
| **Click** | Opens the card; any clock or date also opens it [S: changelog 1.2.5] |
| **Data source** | Secret iCal links read every 15 minutes, read-only; events you add locally; renewals, payouts, limit resets and milestones from other widgets [S: connect-google-calendar] [S: home] [S: changelog 1.2.12] |
| **Refresh** | Every 15 minutes [S: connect-google-calendar] |
| **Setup** | Paste an iCal link under Calendars in the card [S: connect-google-calendar] |
| **Captures** | `_evidence/assets/calendar-dark-BgRPmv3O.webp`, `_evidence/assets/calendar-light-Djrwr0MX.webp` [O] |
| **Buildable here?** | Yes; existing Shelf iCal parser is a starting point [I] |

### Currency

> Convert between currencies at current rates. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Productivity [S: widgets] |
| **Tile shows** | Amount, converted amount, two currency pills with a swap arrow [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 550×154 px in the capture, wide (3.57:1) [M] |
| **Layout** | Radius 39 px, rim #ffffff at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Finds any of 152 currencies by country or name, typo tolerant, in English, Uzbek or Russian [S: changelog 1.2.8] |
| **Click** | Gap (G-04) |
| **Data source** | Current rates from an unnamed service (G-03) [S: widgets] |
| **Refresh** | Gap (G-03) |
| **Setup** | None [I] |
| **Captures** | `_evidence/assets/currency-dark-DlHdK2hs.webp`, `_evidence/assets/currency-light-CIsQu_oN.webp` [O] |
| **Buildable here?** | Yes, with a free rates API to choose [I] |
