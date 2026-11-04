# AI widgets

10 widgets. Tags and the template are explained in [the README](../README.md).

### Claude Usage

> Your Claude session limit and when it resets. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | AI [S: widgets] |
| **Tile shows** | Square orange logo tile, `Session`, time to reset, large percent, thick green bar [O] |
| **States** | Locked until it finds the sign-in; Check again retries [S: connect pages]. Expired: asks to sign in with that tool [S: connect pages]. Keeps the last reading while the tool is closed [S: changelog 1.2.5, 1.2.10]. Loading: Gap (G-02). |
| **Tile size** | 422×154 px in the capture, wide (2.74:1) [M] |
| **Layout** | Radius 33 px, rim #fdfdfd at 14%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | `USAGE` rows for Session, Weekly and Opus, each with reset and bar; `SUBSCRIPTION` rows for Subscribed, Last charge, Next charge, Extra usage; note on ≈ dates; Refresh [O: for-developers] [S: connect-claude] |
| **Click** | Opens the card [S: connect-claude] |
| **Data source** | Lumabar reads Claude Code's saved sign-in and sends it only to Claude; falls back to token counts from Claude Code's logs [S: connect-claude] |
| **Refresh** | While Claude Code is in use, otherwise every 15 minutes; survives restarts [S: changelog 1.2.10] |
| **Setup** | Claude Code installed and signed in; Check again on the card [S: connect-claude] |
| **Captures** | `_evidence/assets/claude-usage-dark-CYjg1sFn.webp`, `_evidence/assets/claude-usage-light-RjJ1J8_1.webp` [O] |
| **Buildable here?** | Yes, differently: use Claude Code's status line `rate_limits`, already working in Shelf, not the login token (G-05). Plan, charge dates and Opus row have no source there [I] |

### Claude Plan Usage

> Session and weekly Claude limits, plus your most-used model. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | AI [S: widgets] |
| **Tile shows** | Orange logo tile; rows Session and Weekly (bar, reset, percent) and a third row with the most-used model and its tokens [O] |
| **States** | Locked until it finds the sign-in; Check again retries [S: connect pages]. Expired: asks to sign in with that tool [S: connect pages]. Keeps the last reading while the tool is closed [S: changelog 1.2.5, 1.2.10]. Loading: Gap (G-02). |
| **Tile size** | 780×154 px in the capture, wide (5.06:1) [M] |
| **Layout** | Radius 33 px, rim #fcfbfc at 14%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | Same Claude card as Claude Usage [S: connect-claude] |
| **Click** | Opens the card [S: connect-claude] |
| **Data source** | Same as Claude Usage; most-used model and tokens from Claude Code's logs [S: connect-claude] [I] |
| **Refresh** | Same as Claude Usage [S: changelog 1.2.10] |
| **Setup** | Same as Claude Usage [S: connect-claude] |
| **Captures** | `_evidence/assets/claude-plan-usage-dark-vQ2IlQsX.webp`, `_evidence/assets/claude-plan-usage-light-Bu64lDGV.webp` [O] |
| **Buildable here?** | Yes for Session and Weekly via the status line. Most-used model needs reading Claude Code's local logs, which contain no login (confirm in planning) [I] |

### ChatGPT Usage

> Your ChatGPT plan's Codex limits: the 5-hour and weekly windows. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | AI [S: widgets] |
| **Tile shows** | White logo tile; Session and Weekly with bar, reset and percent [O] |
| **States** | Locked until it finds the sign-in; Check again retries [S: connect pages]. Expired: asks to sign in with that tool [S: connect pages]. Keeps the last reading while the tool is closed [S: changelog 1.2.5, 1.2.10]. Loading: Gap (G-02). |
| **Tile size** | 706×154 px in the capture, wide (4.58:1) [M] |
| **Layout** | Radius 31 px, rim #ffffff at 11%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 7%, fill #000000 at 4.3% [M] |
| **Card** | Header with logo, name and plan pill; one row per limit with `resets …`, percent and bar; a usage chart; footer note with Refresh [O: ai-cards] [S: changelog 1.0.1, 1.2.10] |
| **Click** | Opens the card [S: connect-chatgpt] |
| **Data source** | Reads the sign-in the Codex CLI saved, sends it only to ChatGPT; these are Codex limits, not chat limits [S: connect-chatgpt] |
| **Refresh** | About once a minute [S: guides/ai-usage-tracker-windows] |
| **Setup** | Codex CLI signed in with ChatGPT; Check again [S: connect-chatgpt] |
| **Captures** | `_evidence/assets/chatgpt-usage-dark-CTrDIHOZ.webp`, `_evidence/assets/chatgpt-usage-light-CSswGcAS.webp` [O] |
| **Buildable here?** | Decide per vendor: the tile needs that vendor's saved login, and each vendor's rules must allow it (see G-05) [I] |

### Gemini Usage

> Gemini CLI quota for Pro and Flash. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | AI [S: widgets] |
| **Tile shows** | White logo tile; Pro and Flash with bar, reset and percent [O] |
| **States** | Locked until it finds the sign-in; Check again retries [S: connect pages]. Expired: asks to sign in with that tool [S: connect pages]. Keeps the last reading while the tool is closed [S: changelog 1.2.5, 1.2.10]. Loading: Gap (G-02). |
| **Tile size** | 706×154 px in the capture, wide (4.58:1) [M] |
| **Layout** | Radius 29 px, rim #ffffff at 11%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 7%, fill #000000 at 4.3% [M] |
| **Card** | Header with logo, name and plan pill; one row per limit with `resets …`, percent and bar; a usage chart; footer note with Refresh [O: ai-cards] [S: changelog 1.0.1, 1.2.10] |
| **Click** | Opens the card [S: connect-gemini] |
| **Data source** | Asks Antigravity running on the PC; reads the Gemini CLI sign-in where it still works; keeps the last reading when closed [S: connect-gemini] [S: changelog 1.2.4] |
| **Refresh** | About once a minute while Antigravity runs [S: guides/gemini-cli-usage-limits] |
| **Setup** | Antigravity installed, signed in and open; Check again [S: connect-gemini] |
| **Captures** | `_evidence/assets/gemini-usage-dark-DxOug5y_.webp`, `_evidence/assets/gemini-usage-light-DyXy2HCc.webp` [O] |
| **Buildable here?** | Decide per vendor: the tile needs that vendor's saved login, and each vendor's rules must allow it (see G-05) [I] |

### Grok Usage

> SuperGrok credit use, from your own sign-in. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | AI [S: widgets] |
| **Tile shows** | Logo tile; one Credits row with bar, renewal day and percent [O] |
| **States** | Locked until it finds the sign-in; Check again retries [S: connect pages]. Expired: asks to sign in with that tool [S: connect pages]. Keeps the last reading while the tool is closed [S: changelog 1.2.5, 1.2.10]. Loading: Gap (G-02). |
| **Tile size** | 706×154 px in the capture, wide (4.58:1) [M] |
| **Layout** | Radius 32 px, rim #fefefe at 16%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Header with logo, name and plan pill; one row per limit with `resets …`, percent and bar; a usage chart; footer note with Refresh [O: ai-cards] [S: changelog 1.0.1, 1.2.10] |
| **Click** | Opens the card [S: connect-grok] |
| **Data source** | Reads the sign-in the Grok CLI saved, sends it only to Grok [S: connect-grok] |
| **Refresh** | About once a minute [S: guides/ai-usage-tracker-windows] |
| **Setup** | Grok CLI signed in with SuperGrok or X Premium+; Check again [S: connect-grok] |
| **Captures** | `_evidence/assets/grok-usage-dark-C-b1PNvn.webp`, `_evidence/assets/grok-usage-light-pdLhQ1_y.webp` [O] |
| **Buildable here?** | Decide per vendor: the tile needs that vendor's saved login, and each vendor's rules must allow it (see G-05) [I] |

### DeepSeek Balance

> Your DeepSeek balance, with today's and this week's spend. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | AI [S: widgets] |
| **Tile shows** | Blue logo tile; rows Balance, Today, 7 days with right-aligned amounts [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 706×154 px in the capture, wide (4.58:1) [M] |
| **Layout** | Radius 31 px, rim #fefefe at 16%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Balance, spend and how long the balance lasts at that pace; Disconnect [S: connect-deepseek] |
| **Click** | Opens the card [S: connect-deepseek] |
| **Data source** | DeepSeek balance API; spend worked out locally from how the balance moves, so it appears after a while [S: connect-deepseek] |
| **Refresh** | About once a minute [S: guides/ai-usage-tracker-windows] |
| **Setup** | API key `sk-…` [S: connect-deepseek] |
| **Captures** | `_evidence/assets/deepseek-balance-dark-BUvrVXcK.webp`, `_evidence/assets/deepseek-balance-light-k3QalfjG.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### GLM Usage

> Z.ai / Zhipu GLM Coding Plan limits. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | AI [S: widgets] |
| **Tile shows** | Logo tile; Session, Weekly and MCP with bar, reset and percent [O] |
| **States** | Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02). |
| **Tile size** | 706×154 px in the capture, wide (4.58:1) [M] |
| **Layout** | Radius 30 px, rim #fefefe at 8%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 6%, fill #000000 at 4.3% [M] |
| **Card** | Header with logo, name and plan pill; one row per limit with `resets …`, percent and bar; a usage chart; footer note with Refresh [O: ai-cards] [S: changelog 1.0.1, 1.2.10] |
| **Click** | Opens the card [S: connect-glm] |
| **Data source** | Z.ai or Zhipu BigModel API with a pasted key [S: connect-glm] |
| **Refresh** | About once a minute [S: guides/ai-usage-tracker-windows] |
| **Setup** | Z.ai or BigModel key on a Coding Plan [S: connect-glm] |
| **Captures** | `_evidence/assets/glm-usage-dark-Bh3mlsQy.webp`, `_evidence/assets/glm-usage-light-Do4WmVTN.webp` [O] |
| **Buildable here?** | Yes, with a key [I] |

### OpenCode Usage

> OpenCode usage for the current session, from its local history. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | AI [S: widgets] |
| **Tile shows** | Logo tile; `Session`, `last 5h`, large token count [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 436×154 px in the capture, wide (2.83:1) [M] |
| **Layout** | Radius 29 px, rim #ffffff at 9%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 7%, fill #000000 at 4.3% [M] |
| **Card** | Tokens and cost for the session [S: guides/ai-usage-limits-on-desktop] |
| **Click** | Opens the card [I] |
| **Data source** | OpenCode's own history on the PC, read offline [S: docs] |
| **Refresh** | Gap (G-03) |
| **Setup** | OpenCode used on the PC [S: guides/ai-usage-tracker-windows] |
| **Captures** | `_evidence/assets/opencode-usage-dark-BNokwSN4.webp`, `_evidence/assets/opencode-usage-light-DFOicT0Y.webp` [O] |
| **Buildable here?** | Yes, if OpenCode is installed; history format must be studied first [I] |

### OpenCode Plan Usage

> OpenCode tokens this session and this week, and your top model. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | AI [S: widgets] |
| **Tile shows** | Logo tile; rows Session (last 5h), Weekly (last 7d), top model (most used), each with tokens [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 698×154 px in the capture, wide (4.53:1) [M] |
| **Layout** | Radius 34 px, rim #fefefe at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Same as OpenCode Usage [I] |
| **Click** | Opens the card [I] |
| **Data source** | OpenCode's own history on the PC [S: guides/ai-usage-tracker-windows] |
| **Refresh** | Gap (G-03) |
| **Setup** | OpenCode used on the PC [S: guides/ai-usage-tracker-windows] |
| **Captures** | `_evidence/assets/opencode-plan-usage-dark-B8NghNVC.webp`, `_evidence/assets/opencode-plan-usage-light-B1-k4mjD.webp` [O] |
| **Buildable here?** | Yes, if OpenCode is installed [I] |

### Cursor Usage

> Cursor spend and tokens. [S: widgets]

| Field | Detail |
| --- | --- |
| **Category** | AI [S: widgets] |
| **Tile shows** | Logo tile; Auto and API with bar, renewal day and percent [O] |
| **States** | Locked until it finds the sign-in; Check again retries [S: connect pages]. Expired: asks to sign in with that tool [S: connect pages]. Keeps the last reading while the tool is closed [S: changelog 1.2.5, 1.2.10]. Loading: Gap (G-02). |
| **Tile size** | 706×154 px in the capture, wide (4.58:1) [M] |
| **Layout** | Radius 31 px, rim #ffffff at 13%, fill #fefefe at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | Billing cycle, share used, on-demand spend, renewal; marked Preview on the widgets page [S: connect-cursor] [S: widgets] |
| **Click** | Opens the card [S: connect-cursor] |
| **Data source** | Reads the Cursor app's sign-in; site also says preview tile shows sample numbers until its connection ships, and the roadmap still lists it [S: connect-cursor] [S: roadmap] |
| **Refresh** | Gap (G-03) |
| **Setup** | Cursor signed in; Check again [S: connect-cursor] |
| **Captures** | `_evidence/assets/cursor-usage-dark-D5Op5avD.webp`, `_evidence/assets/cursor-usage-light-DkzYha7O.webp` [O] |
| **Buildable here?** | Decide per vendor: the tile needs that vendor's saved login, and each vendor's rules must allow it (see G-05) [I] |
