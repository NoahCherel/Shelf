# 09. Integrations

All connector pages, summarised. "Refresh" is listed only where the site gives it.

## Common pattern

1. Create a read-only key in the service [S: docs]
2. Add the widget, click it, fill in the card [S: connect pages]
3. Connect checks it with one real read and explains any failure [S: connect pages]
4. Disconnect or Logout removes it [S: connect pages]

## Finance

| Service | Input | Calculation | Refresh | Source |
| --- | --- | --- | --- | --- |
| Stripe | Restricted key `rk_`, Balance and Balance transaction sources read | Balance transactions: charges and refunds, net of fees, local days, up to 500 | 5 min | [S: connect-stripe] [S: guides/stripe-revenue-widget-windows] |
| Polar | `polar_oat_`, metrics:read, orders:read | Net payout; sandbox detected; USD without orders:read | Gap | [S: connect-polar] |
| Dodo Payments | Key with Payments read | Ledger net of refunds, fees, tax; fallback to gross; tries live then test | Gap | [S: connect-dodo-payments] |
| Shopify | Store, Client ID, Secret, read_orders; or `shpat_` | Current total after refunds, taxes in; 24-hour token renewed | Gap | [S: connect-shopify] |
| Lemon Squeezy | API key | Paid orders less tax and refunds, USD | Gap | [S: connect-lemon-squeezy] |
| Paddle | `pdl_live_apikey_`, transaction.read | Completed less tax, fee, refunds, credits; sandbox detected | Gap | [S: connect-paddle] |
| Gumroad | Access token from an application | Sales less fee; refunded and disputed excluded | Gap | [S: connect-gumroad] |

Revenue tiles shorten to `$1.5k`, and every chart tile shares a layout: the week's number and change over a filled line [S: changelog 1.0.2, 1.2.10].

## Analytics

| Service | Input | Shows | Refresh | Source |
| --- | --- | --- | --- | --- |
| Google Search Console | Own Google client, sign-in | 28-day clicks and impressions; CTR, position, queries, pages, countries, devices, URL inspection (2,000 a day); data lags two days | Gap | [S: connect-search-console] |
| DataFast | `df_` website key | 7-day visitors and change; 14-day line | Gap | [S: connect-datafast] |
| Plausible | Site, Stats API key, optional server | 7-day visitors; realtime in card | 10 min | [S: connect-plausible] |
| Dub | `dub_` read-only, Pro or higher | 7-day clicks; leads, sales | Gap | [S: connect-dub] |

Search Console has a connect page and changelog entry but isn't in the widgets catalogue: G-14 [M: pages.json].

## Developer

| Service | Input | Shows | Source |
| --- | --- | --- | --- |
| GitHub | `ghp_` with read:user, notifications for unread | Contribution graph, unread, PRs, stars | [S: connect-github] |
| Resend | `re_` full access | Emails, delivered, opened, bounces; cap 1,000 | [S: connect-resend] |
| Linear | `lin_api_` | Assigned, in progress, done line | [S: connect-linear] |
| Supabase | `sbp_`, optional project | Requests, status, users, DB size | [S: connect-supabase] |

## Social

| Service | Input | Method | Source |
| --- | --- | --- | --- |
| X | Sign in with X | OAuth PKCE, listens on 127.0.0.1:53127 | [S: connect-x] |
| YouTube | Handle, `AIza` key | Data API v3 | [S: connect-youtube] |
| TikTok | Username | Hidden browser window reads public profile, hourly | [S: connect-tiktok] |
| Instagram | Username, token | API; Instagram-login token renewed weekly; Facebook token 60 days | [S: connect-instagram] |

## AI

| Service | Input | Method | Source |
| --- | --- | --- | --- |
| Claude | Claude Code signed in | Reads its saved sign-in; token counts from logs as fallback; plan and charge dates in card, ≈ means estimated | [S: connect-claude] |
| ChatGPT | Codex CLI signed in | Reads saved sign-in; Codex limits only | [S: connect-chatgpt] |
| Gemini | Antigravity signed in and open | Asks local Antigravity; keeps last reading; Gemini CLI as fallback | [S: connect-gemini] |
| Grok | Grok CLI signed in | Reads saved sign-in | [S: connect-grok] |
| Cursor | Cursor app signed in | Reads app's sign-in; preview | [S: connect-cursor] |
| DeepSeek | `sk-` key | Balance; spend worked out from balance changes | [S: connect-deepseek] |
| GLM | Z.ai or BigModel key | Coding Plan windows | [S: connect-glm] |
| OpenCode | None | Local history, offline | [S: docs] |

**Shelf differs for Claude on purpose.** See G-05. Shelf's status line route gives live Session and Weekly numbers without touching the login.

## Mail and more

| Service | Input | Method | Source |
| --- | --- | --- | --- |
| Gmail | Own Google client, sign-in | Read-only; 7-day sign-out while in testing; 3-minute sign-in limit | [S: connect-gmail] |
| Google Calendar | Secret iCal address | Read every 15 min, never written back | [S: connect-google-calendar] |
| Outlook, iCloud | iCal link | Same as above | [S: home] |
| Stocks | Finnhub key, up to 5 tickers | Every minute; last price kept offline | [S: connect-stocks] [S: changelog 1.2.11] |
| Wallpaper Gallery | Unsplash Access Key | 50 requests an hour on a new app | [S: connect-unsplash] |
| LeetCode | Username | Public profile | [S: connect-leetcode] |

## Network behaviour

- Works behind traffic-inspecting company networks such as Zscaler [S: changelog 1.2.3]
- Recovers when the PC wakes before Wi-Fi does, keeping last values [S: changelog 1.2.11]
- Plain-language errors [S: changelog 0.1.8]

## Sample error messages

| Service | Message | Fix | Source |
| --- | --- | --- | --- |
| Most | "… rejected that key" | Copy it again | [S: connect pages] |
| Stripe, Polar, Paddle | "… accepted the key but it is not allowed to read this" | Add the permission | [S: connect-stripe] |
| Resend | "This Resend key may only send emails" | Use Full access | [S: connect-resend] |
| Gmail | "Access blocked: the app has not completed verification" | Add a test user | [S: connect-gmail] |
| Claude | "The tile stays locked" | Sign in, Check again | [S: connect-claude] |
| Gemini | "The numbers stopped changing" | Antigravity is closed | [S: connect-gemini] |
| Supabase | "Database: Not answering - paused?" | Restore the project | [S: connect-supabase] |
