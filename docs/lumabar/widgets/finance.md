# Finance widgets

15 widgets. Tags and the template are explained in [the README](../README.md).

### Total Revenue

> Every connected store's last 30 days added up, with a monthly goal and its pace. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Green ring with percent of goal, total, `of $15,000 · Oct 63%` month pace [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 408×154 px in the capture, wide (2.65:1) [M] |
| **Layout** | Radius 34 px, rim #fffeff at 15%, fill #fffeff at 5.5% in dark. Light: rim #020002 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Adds every connected store, monthly goal and pace [S: guides/polar-revenue-widget-windows] [S: changelog 1.1.0] |
| **Click** | Opens the card [I] |
| **Data source** | Sum of connected finance widgets over 30 days [S: widgets] |
| **Refresh** | Follows the stores [I] |
| **Setup** | At least one store connected [I] |
| **Captures** | `_evidence/assets/total-revenue-dark-BXnJ1APb.webp`, `_evidence/assets/total-revenue-light-BJEOqlzS.webp` [O] |
| **Buildable here?** | Yes, once a store is connected [I] |

### Polar

> Net revenue over the last 30 days from Polar. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Large amount, `net revenue · 30 days`, round logo [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 362×154 px in the capture, wide (2.35:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 15%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-polar] |
| **Data source** | Polar metrics with an organization token; sandbox detected; net of fees [S: connect-polar] |
| **Refresh** | Gap (G-03) |
| **Setup** | Token `polar_oat_…` with metrics:read and orders:read [S: connect-polar] |
| **Captures** | `_evidence/assets/polar-dark-DT4DgFDi.webp`, `_evidence/assets/polar-light-3NxFAXyF.webp` [O] |
| **Buildable here?** | Yes, with a token [I] |

### Polar Chart

> Your Polar revenue as a 14-day line. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Logo, `Net revenue`, amount, ▲ percent, 14-day filled green line [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 481×154 px in the capture, wide (3.12:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-polar] |
| **Data source** | As Polar; week's number and change [S: changelog 1.0.2] |
| **Refresh** | Gap (G-03) |
| **Setup** | As Polar [S: connect-polar] |
| **Captures** | `_evidence/assets/polar-chart-dark-Zsr_rQLH.webp`, `_evidence/assets/polar-chart-light-ME0K_H64.webp` [O] |
| **Buildable here?** | Yes, with a token [I] |

### Stripe

> Net revenue over the last 30 days from Stripe. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Large amount, `net revenue · 30 days`, round logo [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 362×154 px in the capture, wide (2.35:1) [M] |
| **Layout** | Radius 34 px, rim #ffffff at 15%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 11%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-stripe] |
| **Data source** | Balance transactions, charges and refunds only, up to 500 per refresh, days in local time, net of fees [S: guides/stripe-revenue-widget-windows] |
| **Refresh** | Every 5 minutes [S: guides/stripe-revenue-widget-windows] |
| **Setup** | Restricted key `rk_live_…` reading Balance and Balance transaction sources [S: connect-stripe] |
| **Captures** | `_evidence/assets/stripe-dark-ClB4G2cr.webp`, `_evidence/assets/stripe-light-BNyrfaSO.webp` [O] |
| **Buildable here?** | Yes, with a key; replaces Shelf's charges approach [I] |

### Stripe Chart

> Your Stripe revenue as a line. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Logo, `Net revenue`, amount, ▲ percent, 14-day filled green line with end dot [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 481×154 px in the capture, wide (3.12:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-stripe] |
| **Data source** | As Stripe [S: guides/stripe-revenue-widget-windows] |
| **Refresh** | Every 5 minutes [S: guides/stripe-revenue-widget-windows] |
| **Setup** | As Stripe [S: connect-stripe] |
| **Captures** | `_evidence/assets/stripe-chart-dark-C_4g6Gfb.webp`, `_evidence/assets/stripe-chart-light-CIG3Qemg.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Dodo Payments

> Net revenue from Dodo Payments. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Large amount, `net revenue · 30 days`, round logo [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 362×154 px in the capture, wide (2.35:1) [M] |
| **Layout** | Radius 37 px, rim #ffffff at 13%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 8%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-dodo-payments] |
| **Data source** | Balance ledger, net of refunds, fees and tax; falls back to gross and says revenue; tries live then test server [S: connect-dodo-payments] |
| **Refresh** | Gap (G-03) |
| **Setup** | API key with Payments read [S: connect-dodo-payments] |
| **Captures** | `_evidence/assets/dodo-payments-dark-DPEB8iof.webp`, `_evidence/assets/dodo-payments-light-DrFHO5PL.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Dodo Chart

> Your Dodo Payments revenue as a line. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Logo, `Net revenue`, amount, ▲ percent, 14-day filled line [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 481×154 px in the capture, wide (3.12:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-dodo-payments] |
| **Data source** | As Dodo Payments [S: connect-dodo-payments] |
| **Refresh** | Gap (G-03) |
| **Setup** | As Dodo Payments [S: connect-dodo-payments] |
| **Captures** | `_evidence/assets/dodo-chart-dark-CjRq1j-q.webp`, `_evidence/assets/dodo-chart-light-V3hesYnh.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Shopify

> Your store's net sales over the last 30 days. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Large amount, `net revenue · 30 days`, round logo [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 361×154 px in the capture, wide (2.34:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-shopify] |
| **Data source** | Orders after refunds, taxes included; test and cancelled left out; client credentials traded for a 24-hour token, renewed automatically [S: connect-shopify] |
| **Refresh** | Gap (G-03) |
| **Setup** | Store address, Client ID and Secret with read_orders; older `shpat_` tokens work [S: connect-shopify] |
| **Captures** | `_evidence/assets/shopify-dark-BDgCGgva.webp`, `_evidence/assets/shopify-light-Cn7k0kkh.webp` [O] |
| **Buildable here?** | Yes, with an app [I] |

### Shopify Chart

> This week's Shopify sales and how they moved, over 14 days. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Logo, `Net revenue`, amount, ▲ percent, 14-day filled line [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 481×154 px in the capture, wide (3.12:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-shopify] |
| **Data source** | As Shopify [S: connect-shopify] |
| **Refresh** | Gap (G-03) |
| **Setup** | As Shopify [S: connect-shopify] |
| **Captures** | `_evidence/assets/shopify-chart-dark-jjMsh5Us.webp`, `_evidence/assets/shopify-chart-light-UOa0LfyV.webp` [O] |
| **Buildable here?** | Yes, with an app [I] |

### Lemon Squeezy

> Revenue after tax and refunds over 30 days. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Large amount, `net revenue · 30 days`, round logo [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 361×154 px in the capture, wide (2.34:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-lemon-squeezy] |
| **Data source** | Paid orders less tax and refunds, in USD; test keys read test orders [S: connect-lemon-squeezy] |
| **Refresh** | Gap (G-03) |
| **Setup** | API key [S: connect-lemon-squeezy] |
| **Captures** | `_evidence/assets/lemon-squeezy-dark-CVeK-Y9A.webp`, `_evidence/assets/lemon-squeezy-light-DMWA9Vcs.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Lemon Squeezy Chart

> This week's Lemon Squeezy revenue over a 14-day line. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Logo, `Net revenue`, amount, ▲ percent, 14-day filled line [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 481×154 px in the capture, wide (3.12:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-lemon-squeezy] |
| **Data source** | As Lemon Squeezy [S: connect-lemon-squeezy] |
| **Refresh** | Gap (G-03) |
| **Setup** | As Lemon Squeezy [S: connect-lemon-squeezy] |
| **Captures** | `_evidence/assets/lemon-squeezy-chart-dark-DnDWIHya.webp`, `_evidence/assets/lemon-squeezy-chart-light-BLwletCw.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Paddle

> What you earned from Paddle transactions over 30 days. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Large amount, `net revenue · 30 days`, round logo [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 361×154 px in the capture, wide (2.34:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-paddle] |
| **Data source** | Completed transactions less tax, fee, refunds and credits; sandbox detected [S: connect-paddle] |
| **Refresh** | Gap (G-03) |
| **Setup** | Key `pdl_live_apikey_…` with transaction.read [S: connect-paddle] |
| **Captures** | `_evidence/assets/paddle-dark-B8juZXML.webp`, `_evidence/assets/paddle-light-BCjU1AkE.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Paddle Chart

> This week's Paddle revenue over a 14-day line. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Logo, `Net revenue`, amount, ▲ percent, 14-day filled line [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 481×154 px in the capture, wide (3.12:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-paddle] |
| **Data source** | As Paddle [S: connect-paddle] |
| **Refresh** | Gap (G-03) |
| **Setup** | As Paddle [S: connect-paddle] |
| **Captures** | `_evidence/assets/paddle-chart-dark-C9NG0ZoG.webp`, `_evidence/assets/paddle-chart-light-C1KNI0zo.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### Gumroad

> What you kept from Gumroad sales, after the fee. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Large amount, `net revenue · 30 days`, round logo [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 361×154 px in the capture, wide (2.34:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-gumroad] |
| **Data source** | Sales less Gumroad's fee; refunded, charged-back and disputed left out [S: connect-gumroad] |
| **Refresh** | Gap (G-03) |
| **Setup** | Access token from an application [S: connect-gumroad] |
| **Captures** | `_evidence/assets/gumroad-dark-v0wOgmeH.webp`, `_evidence/assets/gumroad-light-BG8Lg6i-.webp` [O] |
| **Buildable here?** | Yes, with a token [I] |

### Gumroad Chart

> This week's Gumroad sales over a 14-day line. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | Finance [S: widgets] |
| **Tile shows** | Logo, `Net revenue`, amount, ▲ percent, 14-day filled line [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 481×154 px in the capture, wide (3.12:1) [M] |
| **Layout** | Radius 36 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Today, 7 days and 30 days, the payments behind them, a 14-day line, Test mode label for test keys, Disconnect [S: connect page] |
| **Click** | Opens the card [S: connect-gumroad] |
| **Data source** | As Gumroad [S: connect-gumroad] |
| **Refresh** | Gap (G-03) |
| **Setup** | As Gumroad [S: connect-gumroad] |
| **Captures** | `_evidence/assets/gumroad-chart-dark-DFfjBg2E.webp`, `_evidence/assets/gumroad-chart-light-C7cWF6UT.webp` [O] |
| **Buildable here?** | Yes, with a token [I] |
