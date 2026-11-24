# Analytics widgets

3 widgets. Tags and the template are explained in [the README](../README.md).

### DataFast Chart

| Field | Detail |
| --- | --- |
| **Category** | Analytics [S: widgets] |
| **Tile shows** | Logo, `Visitors`, count, ▲ percent, orange filled line [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 481×154 px in the capture, wide (3.12:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 30-day sessions, revenue, conversion, time on site, bounce rate [S: connect-datafast] |
| **Click** | Opens the card [S: connect-datafast] |
| **Data source** | DataFast API, 7 days against the week before, 14-day line [S: connect-datafast] |
| **Refresh** | Gap (G-03) |
| **Setup** | Website key `df_…` [S: connect-datafast] |
| **Captures** | `_evidence/assets/datafast-chart-dark-C1GVh5Hl.webp`, `_evidence/assets/datafast-chart-light-r1is-Otf.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Plausible

| Field | Detail |
| --- | --- |
| **Category** | Analytics [S: widgets] |
| **Tile shows** | Logo tile, large number, ▲ percent, `visitors · 7 days`, sparkline [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 568×154 px in the capture, wide (3.69:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, on site now, 30-day visitors, pageviews, bounce rate, visit duration [S: connect-plausible] |
| **Click** | Opens the card [S: connect-plausible] |
| **Data source** | Stats API; self-hosted server optional [S: connect-plausible] |
| **Refresh** | Every 10 minutes [S: connect-plausible] |
| **Setup** | Site domain and Stats API key [S: connect-plausible] |
| **Captures** | `_evidence/assets/plausible-dark-BrL9zWhH.webp`, `_evidence/assets/plausible-light-BAsO0WWS.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Dub

| Field | Detail |
| --- | --- |
| **Category** | Analytics [S: widgets] |
| **Tile shows** | Logo tile, large number, ▲ percent, `clicks · 7 days`, sparkline [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 568×154 px in the capture, wide (3.69:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 30-day clicks, leads, sales, revenue [S: connect-dub] |
| **Click** | Opens the card [S: connect-dub] |
| **Data source** | Dub analytics API, Pro plan or higher [S: connect-dub] |
| **Refresh** | Gap (G-03) |
| **Setup** | Read-only key `dub_…` [S: connect-dub] |
| **Captures** | `_evidence/assets/dub-dark-CM17egE_.webp`, `_evidence/assets/dub-light-DDk42buM.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |
