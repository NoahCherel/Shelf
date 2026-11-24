# Online & Mail widgets

7 widgets. Tags and the template are explained in [the README](../README.md).

### Metric

| Field | Detail |
| --- | --- |
| **Category** | Online & Mail [S: widgets] |
| **Tile shows** | Logo tile, `BTC / USD`, green change pill, large price [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 494×154 px in the capture, wide (3.21:1) [M] |
| **Layout** | Radius 37 px, rim #ffffff at 17%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | A live number; source unnamed (G-03) [S: widgets] |
| **Refresh** | Gap (G-03) |
| **Setup** | Gap (G-04) |
| **Captures** | `_evidence/assets/metric-dark-Dj_hl7b9.webp`, `_evidence/assets/metric-light-D-VHYT9Y.webp` [O] |
| **Buildable here?** | Yes, with a chosen price API [I] |

### Wallpaper Gallery

| Field | Detail |
| --- | --- |
| **Category** | Online & Mail [S: widgets] |
| **Tile shows** | Square tile filled with the current wallpaper [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 154×154 px in the capture, square (1:1) [M] |
| **Layout** | Radius 35 px, rim #e4f0fa at 100%, fill #dfeef2 at 100.0% in dark. Light: rim #232524 at 100%, fill #0e0e0e at 100.0% [M] |
| **Card** | Unsplash, Windows and MacBook tabs, landscape only; set in one click; daily or weekly change [S: connect-unsplash] [S: changelog 1.2.9, 1.2.13] |
| **Click** | Opens the gallery [S: connect-unsplash] |
| **Data source** | Unsplash API, 50 requests an hour on a new app [S: connect-unsplash] |
| **Refresh** | On browse [I] |
| **Setup** | Access Key [S: connect-unsplash] |
| **Captures** | `_evidence/assets/wallpaper-gallery-dark-CrOWQuK3.webp`, `_evidence/assets/wallpaper-gallery-light-BJ5H01kf.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Gmail

| Field | Detail |
| --- | --- |
| **Category** | Online & Mail [S: widgets] |
| **Tile shows** | Mail icon, large unread count, `Unread · +4 today`; large counts shortened [O] [S: changelog 1.2.9] |
| **States** | Not connected: offers Connect and its guide [S: changelog 1.2.6]. Sign-in opens the browser, with a 3-minute timeout on Google sign-ins [S: connect pages]. Signed out: asks to sign in again [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 436×154 px in the capture, wide (2.83:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 14%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | iOS Mail style list for Unread, Inbox, Starred; search; click opens in Gmail; new mail button [S: connect-gmail] [S: changelog 1.2.8] |
| **Click** | Opens the card [S: connect-gmail] |
| **Data source** | Gmail API, read only, user's own Google Cloud client; signed out every 7 days while in testing [S: connect-gmail] |
| **Refresh** | Gap (G-03) |
| **Setup** | Client ID and secret, then Sign in with Google [S: connect-gmail] |
| **Captures** | `_evidence/assets/gmail-dark-DqvbsdQH.webp`, `_evidence/assets/gmail-light-BKOsndq0.webp` [O] |
| **Buildable here?** | Yes, with your own client [I] |

### GitHub Activity

| Field | Detail |
| --- | --- |
| **Category** | Online & Mail [S: widgets] |
| **Tile shows** | `today`, `week`, 🔥 `streak` counts above a 13-column, 3-row green grid [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 411×154 px in the capture, wide (2.67:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 14%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Opens the card [S: connect-github] |
| **Data source** | GitHub with a token [S: connect-github]; Shelf found the public contribution page also works |
| **Refresh** | Gap (G-03) |
| **Setup** | Token `ghp_…` with read:user [S: connect-github] |
| **Captures** | `_evidence/assets/github-activity-dark-DwOXvAQb.webp`, `_evidence/assets/github-activity-light-6ib92nH8.webp` [O] |
| **Buildable here?** | Yes; Shelf's parser already reads real data [I] |

### GitHub

| Field | Detail |
| --- | --- |
| **Category** | Online & Mail [S: widgets] |
| **Tile shows** | Large unread count, `Unread · yourname`, round logo [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 459×154 px in the capture, wide (2.98:1) [M] |
| **Layout** | Radius 38 px, rim #ffffff at 13%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 8%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Opens the card [S: connect-github] |
| **Data source** | Notifications API, needs the notifications scope [S: connect-github] |
| **Refresh** | Gap (G-03) |
| **Setup** | Token with notifications [S: connect-github] |
| **Captures** | `_evidence/assets/github-dark-n8wZcNuS.webp`, `_evidence/assets/github-light-CIvypJDE.webp` [O] |
| **Buildable here?** | Yes, with a token [I] |

### GitHub Overview

| Field | Detail |
| --- | --- |
| **Category** | Online & Mail [S: widgets] |
| **Tile shows** | Logo tile; rows Unread, PRs, Stars [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 436×154 px in the capture, wide (2.83:1) [M] |
| **Layout** | Radius 39 px, rim #ffffff at 12%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 8%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Opens the card [S: connect-github] |
| **Data source** | GitHub API [S: connect-github] |
| **Refresh** | Gap (G-03) |
| **Setup** | Token with read:user [S: connect-github] |
| **Captures** | `_evidence/assets/github-overview-dark-BOqjQNlk.webp`, `_evidence/assets/github-overview-light-iB-laidm.webp` [O] |
| **Buildable here?** | Yes, with a token [I] |

### LeetCode Stats

| Field | Detail |
| --- | --- |
| **Category** | Online & Mail [S: widgets] |
| **Tile shows** | `solved`, 🔥 `streak`, amber dot grid [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 436×154 px in the capture, wide (2.83:1) [M] |
| **Layout** | Radius 37 px, rim #ffffff at 12%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 8%, fill #000000 at 4.3% [M] |
| **Card** | Solved by difficulty, streak, submissions calendar [S: connect-leetcode] |
| **Click** | Opens the card [S: connect-leetcode] |
| **Data source** | Public profile by username [S: connect-leetcode] |
| **Refresh** | Gap (G-03) |
| **Setup** | Username [S: connect-leetcode] |
| **Captures** | `_evidence/assets/leetcode-stats-dark-D4OPohxO.webp`, `_evidence/assets/leetcode-stats-light-Lq7n8ea3.webp` [O] |
| **Buildable here?** | Yes [I] |
