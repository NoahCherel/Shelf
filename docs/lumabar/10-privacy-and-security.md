# 10. Privacy and security

## Lumabar's stance

- No account, no server of its own, no telemetry [S: docs] [S: privacy]
- Widgets, layout, themes, todos, notes and settings stay on the PC [S: privacy]
- Each widget talks directly to its own service [S: docs]
- Remove a widget and its requests stop; revoke a key and it stops everywhere [S: docs]
- Lumabar never reads the clipboard for activation [S: docs]
- Nothing is sent as feedback until you press Send [S: privacy]

## What each kind of widget touches

| Widget | Reads on the PC | Sends to | Source |
| --- | --- | --- | --- |
| Claude, ChatGPT, Gemini, Grok | That service's saved sign-in | That vendor only | [S: docs] |
| DeepSeek, GLM | The pasted key | That service only | [S: docs] |
| OpenCode | Its session history | Nowhere | [S: docs] |
| Other account tiles | Pasted key or local sign-in | That service only | [S: docs] |
| Calendar | iCal link | That calendar's host | [S: connect-google-calendar] |
| Screen Time | Foreground app, optional site short name, kept 90 days | Nowhere | [S: guides/screen-time-windows] |

Gemini detail: reads `.gemini\oauth_creds.json`, refreshes in memory and leaves the file alone [S: guides/gemini-cli-usage-limits].

## Key storage

The site says keys are "stored only on this PC" and doesn't say how [S: docs]. It doesn't mention encryption. So how Lumabar protects them is unknown: G-15.

**Recommendation for the rebuild:** Windows Credential Manager or DPAPI rather than the plain text in Shelf's `localStorage` [I].

## Rules for the rebuild

| Rule | Why |
| --- | --- |
| Never read `.credentials.json` for Claude | Anthropic's terms keep those tokens for Claude Code and its own apps; other tools may not collect or store them [S: code.claude.com/docs/en/legal-and-compliance] |
| Check each other vendor's rules before reading its login | G-05 [I] |
| Read-only keys only | Lumabar's own design [S: docs] |
| Keep a "what's sent where" table in the app's docs | Lumabar's pattern is good and cheap [S: docs] [I] |
| Screen Time stays local; websites off by default; name only, never private windows | [S: guides/screen-time-windows] |
| Hide a capture-based dock from its own capture | Avoids feedback and stray copies [S: roadmap] [I] |

## Web content

The rebuild's WebView shows text from feeds and APIs, so render it as text only. Shelf's iCal test proved this works [I].
