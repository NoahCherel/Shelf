# Stocks widgets

3 widgets. Tags and the template are explained in [the README](../README.md).

### Stock

| Field | Detail |
| --- | --- |
| **Category** | Stocks [S: widgets] |
| **Tile shows** | Ticker, company, very large price, green or red change [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 398×154 px in the capture, wide (2.58:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 17%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | Change stock… on right-click [S: connect-stocks] |
| **Click** | Opens the card [S: connect-stocks] |
| **Data source** | Finnhub, up to five tickers, keeps the last price offline [S: connect-stocks] [S: changelog 1.2.11] |
| **Refresh** | Every minute [S: connect-stocks] |
| **Setup** | Finnhub key and tickers [S: connect-stocks] |
| **Captures** | `_evidence/assets/stock-dark-DwRrIcAr.webp`, `_evidence/assets/stock-light-CIc5cFaj.webp` [O] |
| **Buildable here?** | Yes, with a free key [I] |

### Stock Chart

| Field | Detail |
| --- | --- |
| **Category** | Stocks [S: widgets] |
| **Tile shows** | Ticker, price, change, intraday filled line [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 468×154 px in the capture, wide (3.04:1) [M] |
| **Layout** | Radius 37 px, rim #ffffff at 17%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | As Stock [S: connect-stocks] |
| **Click** | Opens the card [S: connect-stocks] |
| **Data source** | Finnhub [S: connect-stocks] |
| **Refresh** | Every minute [S: connect-stocks] |
| **Setup** | As Stock [S: connect-stocks] |
| **Captures** | `_evidence/assets/stock-chart-dark-DyVhyF6Q.webp`, `_evidence/assets/stock-chart-light-J_DpI9YC.webp` [O] |
| **Buildable here?** | Yes, with a free key [I] |

### Stock Watchlist

| Field | Detail |
| --- | --- |
| **Category** | Stocks [S: widgets] |
| **Tile shows** | Three rows: ticker, price, green or red change [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 652×154 px in the capture, wide (4.23:1) [M] |
| **Layout** | Radius 37 px, rim #ffffff at 17%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | Edit watchlist… on right-click [S: connect-stocks] |
| **Click** | Opens the card [S: connect-stocks] |
| **Data source** | Finnhub [S: connect-stocks] |
| **Refresh** | Every minute [S: connect-stocks] |
| **Setup** | As Stock [S: connect-stocks] |
| **Captures** | `_evidence/assets/stock-watchlist-dark-BCcmZoRP.webp`, `_evidence/assets/stock-watchlist-light-B4l0dLr2.webp` [O] |
| **Buildable here?** | Yes, with a free key [I] |
