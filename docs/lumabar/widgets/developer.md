# Developer widgets

3 widgets. Tags and the template are explained in [the README](../README.md).

### Resend

| Field | Detail |
| --- | --- |
| **Category** | Developer [S: widgets] |
| **Tile shows** | Logo tile, number, ▲ percent, `emails · 7 days`, sparkline [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 568×154 px in the capture, wide (3.69:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, delivered and opened share, bounces, complaints, domains [S: connect-resend] |
| **Click** | Opens the card [S: connect-resend] |
| **Data source** | List emails, up to 1,000 then `1,000+`, 2 requests per second [S: connect-resend] |
| **Refresh** | Gap (G-03) |
| **Setup** | Full-access key `re_…` [S: connect-resend] |
| **Captures** | `_evidence/assets/resend-dark-EHeayuA6.webp`, `_evidence/assets/resend-light-Dj8JsK05.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Linear

| Field | Detail |
| --- | --- |
| **Category** | Developer [S: widgets] |
| **Tile shows** | Logo tile, count, `assigned · 2 in progress`, grey wave of finished issues [O] [S: connect-linear] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 592×154 px in the capture, wide (3.84:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | To do, backlog, overdue, due this week, urgent, done in 7 days [S: connect-linear] |
| **Click** | Opens the card [S: connect-linear] |
| **Data source** | GraphQL API with a personal key [S: connect-linear] |
| **Refresh** | Gap (G-03) |
| **Setup** | Key `lin_api_…` [S: connect-linear] |
| **Captures** | `_evidence/assets/linear-dark-BGevqrwW.webp`, `_evidence/assets/linear-light-BFk5i1Me.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Supabase

| Field | Detail |
| --- | --- |
| **Category** | Developer [S: widgets] |
| **Tile shows** | Logo tile, number, ▲ percent, `API requests · 24 hours`, sparkline [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 587×154 px in the capture, wide (3.81:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Status, region, users, weekly joins, database size, requests by REST, Auth, Storage, Realtime [S: connect-supabase] |
| **Click** | Opens the card [S: connect-supabase] |
| **Data source** | Management API and a read-only SQL query [S: connect-supabase] |
| **Refresh** | Gap (G-03) |
| **Setup** | Token `sbp_…`, optional project [S: connect-supabase] |
| **Captures** | `_evidence/assets/supabase-dark-BGl47DG2.webp`, `_evidence/assets/supabase-light-CsxB_eaS.webp` [O] |
| **Buildable here?** | Yes, with a token [I] |
