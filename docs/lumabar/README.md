# Lumabar study

A complete written study of [Lumabar](https://lumabar.xyz), version 1.2.13, made before rebuilding Shelf. **This is a private reference for a private tool.** Don't publish it, or anything built to copy it.

No product code came out of this study. The build plan is in [`docs/superpowers/plans/`](../superpowers/plans/).

## Main findings

1. **Tauri was right.** Lumabar is Rust and React on Tauri, and a working spike showed live refraction in a web view. See [14](14-tech-stack.md).
2. **Shelf's problem was design.** Lumabar's tiles are almost clear (5.5% white plus a 15% rim) and fill the bar, with very large numbers. See [03](03-design-system.md).
3. **The widget page undersells it.** The changelog reveals automations, app groups, previews, jump lists and a unified calendar. See [11](11-history-and-lessons.md).
4. **Public sources have limits.** Settings and about half the cards have never been published. These are listed, with the decision made for each, in [12](12-gaps.md).

## Documents

| # | Document | Covers |
| --- | --- | --- |
| 01 | [Product](01-product.md) | What it is, facts, first run |
| 02 | [Dock](02-dock.md) | Position, size, displays, taskbar, fullscreen |
| 03 | [Design system](03-design-system.md) | Font, sizes, colours, styles, motion |
| 04 | [Glass](04-glass.md) | How the refraction behaves and likely works |
| 05 | [Apps and taskbar](05-apps-and-taskbar.md) | Pins, previews, menus, drag and drop |
| 06 | [Widget management](06-widget-management.md) | Adding, removing, arranging |
| 07 | [Settings](07-settings.md) | Every known setting and how to reach it |
| 08 | [Cards and interactions](08-cards-and-interactions.md) | Detail windows, menus, keys |
| 09 | [Integrations](09-integrations.md) | Every connector |
| 10 | [Privacy and security](10-privacy-and-security.md) | Data flows, rules for the rebuild |
| 11 | [History and lessons](11-history-and-lessons.md) | All 30 releases |
| 12 | [Gaps](12-gaps.md) | What's unknown, and what we decided |
| 13 | [Architecture](13-architecture.md) | Proposed structure, widget contract |
| 14 | [Tech stack](14-tech-stack.md) | Tauri evaluation, spike, token check |
| 15 | [Feature checklist](15-feature-checklist.md) | Every feature, numbered |

Widgets, one file per category:

<!-- COVERAGE_WIDGETS -->
| Category | Count | Document |
| --- | --- | --- |
| AI | 10 | [widgets/ai.md](widgets/ai.md) |
| Productivity | 9 | [widgets/productivity.md](widgets/productivity.md) |
| Finance | 15 | [widgets/finance.md](widgets/finance.md) |
| System | 14 | [widgets/system.md](widgets/system.md) |
| Media & Audio | 5 | [widgets/media-and-audio.md](widgets/media-and-audio.md) |
| Analytics | 3 | [widgets/analytics.md](widgets/analytics.md) |
| Developer | 3 | [widgets/developer.md](widgets/developer.md) |
| Online & Mail | 7 | [widgets/online-and-mail.md](widgets/online-and-mail.md) |
| Social | 4 | [widgets/social.md](widgets/social.md) |
| Apps & Files | 9 | [widgets/apps-and-files.md](widgets/apps-and-files.md) |
| Weather | 7 | [widgets/weather.md](widgets/weather.md) |
| Stocks | 3 | [widgets/stocks.md](widgets/stocks.md) |
| Clocks | 14 | [widgets/clocks.md](widgets/clocks.md) |
<!-- /COVERAGE_WIDGETS -->

## Evidence tags

Every statement carries one:

| Tag | Meaning |
| --- | --- |
| `[S: page]` | **Stated** by Lumabar's site; `page` is the path on lumabar.xyz, or another named source |
| `[O: capture]` | **Observed** in a published image or clip |
| `[M: source]` | **Measured** from pixels, the stylesheet, release data or our spike |
| `[I]` | **Inferred**: our reasoning, not confirmed |
| `G-nn` | A **gap** in [12-gaps.md](12-gaps.md) |

Within widget entries, a bare `[O]` means that widget's own captures, and `[M]` means measured from them.

## Evidence on disk

`_evidence/` holds the captured pages and images. It's git-ignored and must stay private. To rebuild it and everything generated, run these from the repo root:

```sh
node docs/lumabar/_tools/capture-pages.js
node docs/lumabar/_tools/capture-assets.js
python docs/lumabar/_tools/build-widgets.py
node docs/lumabar/_tools/build-widget-docs.js
node docs/lumabar/_tools/build-checklist.js
node docs/lumabar/_tools/audit.js
```

The refraction spike was a throwaway outside the repo, and its results are recorded in [14](14-tech-stack.md).

## Coverage

Checked by `_tools/audit.js`:

<!-- COVERAGE_SUMMARY -->
| Item | Covered |
| --- | --- |
| Pages read | 65 of 65 (sitemap plus one linked page it omits) |
| Widgets | 103 of 103, all 12 fields present |
| Connector pages | 31 of 31 |
| Releases | 30 of 30 |
| Settings named on the site | 20 of 20 |
| Gaps | 22, each with a proposed default |
<!-- /COVERAGE_SUMMARY -->

### Every page, and where it's used

<!-- COVERAGE_PAGES -->
| Page | Used in |
| --- | --- |
| home | 01, 02, 03, 04, 05, 07, 09, w:apps-and-files, w:productivity |
| widgets | 02, 06, 12, w:ai, w:analytics, w:apps-and-files, w:clocks, w:developer, w:finance, w:media-and-audio, w:online-and-mail, w:productivity, w:social, w:stocks, w:system, w:weather |
| docs | 01, 02, 05, 06, 07, 08, 09, 10, w:ai, w:analytics, w:developer, w:finance, w:online-and-mail, w:productivity, w:social, w:stocks |
| guides | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 13, 14, w:ai, w:finance, w:productivity, w:system |
| changelog | 01, 02, 03, 04, 05, 06, 07, 08, 09, 11, 12, 13, w:ai, w:apps-and-files, w:clocks, w:finance, w:media-and-audio, w:online-and-mail, w:productivity, w:social, w:stocks, w:system, w:weather |
| roadmap | 02, 04, 07, 10, 13, 14, w:ai |
| privacy | 07, 10, w:productivity |
| terms | 01 |
| about | 01, 04, 14 |
| feedback | 01, w:productivity |
| showcase | Read for background |
| guides/polar-revenue-widget-windows | w:finance |
| guides/best-dock-for-windows-11 | 01 |
| guides/make-windows-11-look-like-macos | Read for background |
| guides/rocketdock-windows-11 | Read for background |
| guides/lumabar-vs-winstep-nexus | Read for background |
| guides/best-taskbar-replacement-windows-11 | Read for background |
| guides/best-top-bar-windows-11 | Read for background |
| guides/best-desktop-widgets-windows-11 | 01, 14 |
| guides/hide-taskbar-windows-11 | 02, 05, w:system |
| guides/what-is-lumabar | 01, 03, 06, 07 |
| guides/liquid-glass-windows | 03, 04, 07 |
| guides/ai-usage-tracker-windows | w:ai |
| guides/screen-time-windows | 06, 07, 08, 10, 13, w:productivity |
| guides/unique-windows-widgets | Read for background |
| guides/windows-11-taskbar-top | 02 |
| guides/rainmeter-alternative | 01, 02 |
| guides/mac-menu-bar-for-windows | 01, 05, 07 |
| guides/ai-usage-limits-on-desktop | w:ai |
| guides/gemini-cli-usage-limits | 10, w:ai |
| guides/stripe-revenue-widget-windows | 09, w:finance |
| guides/lumabar-vs-mydockfinder | 05 |
| guides/lumabar-vs-seelen-ui | 01, 07, 14 |
| guides/seelen-ui-alternatives | Read for background |
| docs/connect-stripe | 09, w:finance |
| docs/connect-polar | 09, w:finance |
| docs/connect-dodo-payments | 09, w:finance |
| docs/connect-shopify | 09, w:finance |
| docs/connect-lemon-squeezy | 09, w:finance |
| docs/connect-paddle | 09, w:finance |
| docs/connect-gumroad | 09, w:finance |
| docs/connect-datafast | 09, w:analytics |
| docs/connect-plausible | 09, w:analytics |
| docs/connect-dub | 09, w:analytics |
| docs/connect-github | 09, w:online-and-mail |
| docs/connect-resend | 09, w:developer |
| docs/connect-linear | 09, w:developer |
| docs/connect-supabase | 09, w:developer |
| docs/connect-x | 09, w:social |
| docs/connect-youtube | 09, w:social |
| docs/connect-tiktok | 09, w:social |
| docs/connect-instagram | 09, w:social |
| docs/connect-claude | 09, w:ai |
| docs/connect-chatgpt | 09, w:ai |
| docs/connect-gemini | 09, w:ai |
| docs/connect-grok | 09, w:ai |
| docs/connect-cursor | 09, w:ai |
| docs/connect-deepseek | 09, w:ai |
| docs/connect-glm | 09, w:ai |
| docs/connect-gmail | 08, 09, w:online-and-mail |
| docs/connect-google-calendar | 09, 10, w:productivity |
| docs/connect-stocks | 06, 08, 09, w:stocks |
| docs/connect-unsplash | 09, w:online-and-mail |
| docs/connect-leetcode | 09, w:online-and-mail |
| docs/connect-search-console | 08, 09 |
<!-- /COVERAGE_PAGES -->
