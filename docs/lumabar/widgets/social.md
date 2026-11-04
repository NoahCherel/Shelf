# Social widgets

4 widgets. Tags and the template are explained in [the README](../README.md).

### X Profile

> Followers on your X account. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Social [S: widgets] |
| **Tile shows** | Logo tile, large count, `followers` [O] |
| **States** | Not connected: offers Connect and its guide [S: changelog 1.2.6]. Sign-in opens the browser, with a 3-minute timeout on Google sign-ins [S: connect pages]. Signed out: asks to sign in again [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 436×154 px in the capture, wide (2.83:1) [M] |
| **Layout** | Radius 35 px, rim #ffffff at 15%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Sign in with X [S: connect-x] |
| **Click** | Opens the card [S: connect-x] |
| **Data source** | OAuth 2 with PKCE; listens on 127.0.0.1:53127 during sign-in [S: connect-x] |
| **Refresh** | Gap (G-03) |
| **Setup** | Sign in with X. Needs an X developer client of your own [I] |
| **Captures** | `_evidence/assets/x-profile-dark-5Oyd5Dbi.webp`, `_evidence/assets/x-profile-light-CqqwZPAj.webp` [O] |
| **Buildable here?** | Harder: Lumabar ships its own X client; yours would need creating [I] |

### TikTok

> Followers on your TikTok profile. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Social [S: widgets] |
| **Tile shows** | Logo tile, large count, `@yourname` [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 436×154 px in the capture, wide (2.83:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 15%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Followers, videos, likes [S: connect-tiktok] |
| **Click** | Opens the card [S: connect-tiktok] |
| **Data source** | Opens the public profile in a hidden browser window and reads it [S: connect-tiktok] |
| **Refresh** | Hourly [S: connect-tiktok] |
| **Setup** | Username [S: connect-tiktok] |
| **Captures** | `_evidence/assets/tiktok-dark-B3tu6N_h.webp`, `_evidence/assets/tiktok-light-BfZ8Bzeu.webp` [O] |
| **Buildable here?** | Possible but fragile, and scraping may break TikTok's rules; deprioritise [I] |

### YouTube

> Subscribers on your YouTube channel, via your own API key. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Social [S: widgets] |
| **Tile shows** | Logo tile, large count, `@yourchannel` [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 436×154 px in the capture, wide (2.83:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 15%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Subscribers, videos, total views [S: connect-youtube] |
| **Click** | Opens the card [S: connect-youtube] |
| **Data source** | YouTube Data API v3 [S: connect-youtube] |
| **Refresh** | Gap (G-03) |
| **Setup** | Handle and key `AIza…` [S: connect-youtube] |
| **Captures** | `_evidence/assets/youtube-dark-1ZF1ek7R.webp`, `_evidence/assets/youtube-light-C3F2FnOZ.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Instagram

> Followers on your Instagram account, with an official token. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Social [S: widgets] |
| **Tile shows** | Logo tile, large count, `@handle` [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 433×154 px in the capture, wide (2.81:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Followers, posts [S: connect-instagram] |
| **Click** | Opens the card [S: connect-instagram] |
| **Data source** | Instagram API with a token; Instagram-login tokens renewed weekly [S: connect-instagram] |
| **Refresh** | Gap (G-03) |
| **Setup** | Professional account, Username and Token [S: connect-instagram] |
| **Captures** | `_evidence/assets/instagram-dark-D3Zhz2-E.webp`, `_evidence/assets/instagram-light-CqXh1ZAa.webp` [O] |
| **Buildable here?** | Yes, with a token [I] |
