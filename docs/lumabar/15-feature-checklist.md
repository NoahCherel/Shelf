# 15. Feature checklist

Every feature, numbered, for the implementation plan to trace back to. Priorities are proposals for you to change [I]:

- **P1:** the bar itself, your example layout and what you use daily
- **P2:** the taskbar's full job and everyday widgets
- **P3:** everything else

**Status, 2026-11-04:** Milestone 1 delivers every P1 below except where noted, with F-006 (size slider) from P2 too. Not in M1: the P1 widgets moved to M2 and M3 by the plan, and F-026, where the dock is only on the primary screen and the taskbar is hidden on all of them. F-086 is targeted but only run on Windows 11. What only the owner can verify is in [manual checks](../manual-checks.md).

**Status, 2026-11-09:** the [bar and apps plan](../superpowers/plans/2026-11-05-bar-and-apps.md) adds F-052, F-053, F-049, F-050, F-051, F-004, F-005, F-008, F-010, F-011, F-013, F-014, F-028, F-029, F-031, F-032, the own colour of F-035, F-022, F-048, F-043, F-045, F-047 and F-067, and free placement of widgets along a full-width dock (the owner's request). By the owner's choice it leaves out the several-screen features (F-017, F-018, F-019, F-026) and keyboard shortcuts (F-054, F-090).

**Status, 2026-11-16:** the [plan to finish 1.1 to 1.4](../superpowers/plans/2026-11-13-finir-1-1-a-1-4.md) adds F-017, F-018, F-019, F-026, the Album art half of F-035 and F-054, and measures F-023, whose correction waits on that measurement after a restart. End task (in F-046) stays left out by the owner's choice. The several-screen features were tested on a one-screen PC: the two-screen trials are in [manual checks](../manual-checks.md).

## Dock

| ID | P | Feature | Doc |
| --- | --- | --- | --- |
| F-001 | P1 | Pill shape, centred, sized to contents | [02](02-dock.md) |
| F-002 | P1 | Bottom edge, reserved screen space | [02](02-dock.md) |
| F-003 | P1 | Tile-height scaling from one value | [03](03-design-system.md) |
| F-004 | P2 | Full width mode | [02](02-dock.md) |
| F-005 | P2 | Drag to top edge, remembered, panels open downward | [02](02-dock.md) |
| F-006 | P2 | Size slider with S, M, L | [02](02-dock.md) |
| F-007 | P2 | Distance from edge | [02](02-dock.md) |
| F-008 | P2 | Spacing | [02](02-dock.md) |
| F-009 | P2 | Float over windows | [02](02-dock.md) |
| F-010 | P2 | Auto-hide with pointer and Win key | [02](02-dock.md) |
| F-011 | P3 | Auto-hide: Show on desktop | [02](02-dock.md) |
| F-012 | P2 | Lock dock | [02](02-dock.md) |
| F-013 | P3 | Narrow by dragging ends; double-click undoes | [02](02-dock.md) |
| F-014 | P3 | Horizontal scrolling with gliding | [02](02-dock.md) |
| F-015 | P1 | Hide in fullscreen, stop drawing, free memory | [02](02-dock.md) |
| F-016 | P1 | Recover after sleep and unlock | [02](02-dock.md) |
| F-017 | P2 | Dock on one chosen monitor, remembered | [02](02-dock.md) |
| F-018 | P3 | Dock on all displays | [02](02-dock.md) |
| F-019 | P3 | Dock follows pointer | [02](02-dock.md) |
| F-020 | P1 | Resist other tools moving it | [02](02-dock.md) |
| F-021 | P2 | No blink in screen recordings | [02](02-dock.md) |
| F-022 | P2 | Slide animations; widgets part and animate away | [02](02-dock.md) |
| F-023 | P2 | Reserve space from first moment after boot | [02](02-dock.md) |

## Windows taskbar

| ID | P | Feature | Doc |
| --- | --- | --- | --- |
| F-024 | P1 | Hidden or Auto-hide choice | [02](02-dock.md) |
| F-025 | P1 | Restore exactly on quit, with crash recovery | [13](13-architecture.md) |
| F-026 | P1 | Per-screen handling | [02](02-dock.md) |

## Styles

| ID | P | Feature | Doc |
| --- | --- | --- | --- |
| F-027 | P1 | Liquid Glass with live refraction | [04](04-glass.md) |
| F-028 | P2 | iOS Glass | [04](04-glass.md) |
| F-029 | P2 | Midnight | [03](03-design-system.md) |
| F-030 | P1 | Black | [03](03-design-system.md) |
| F-031 | P2 | White | [03](03-design-system.md) |
| F-032 | P3 | Clear, with black, white or frosted widgets | [03](03-design-system.md) |
| F-033 | P1 | Dark and light tile sets | [03](03-design-system.md) |
| F-034 | P2 | Nine accent colours | [03](03-design-system.md) |
| F-035 | P3 | Own accent; Album art accent | [03](03-design-system.md) |
| F-036 | P2 | Glass rests when nothing changes | [04](04-glass.md) |
| F-037 | P2 | Glass stays out of its own capture | [04](04-glass.md) |

## Apps

| ID | P | Feature | Doc |
| --- | --- | --- | --- |
| F-038 | P1 | Start tile opens Start | [05](05-apps-and-taskbar.md) |
| F-039 | P1 | Taskbar pins and open windows | [05](05-apps-and-taskbar.md) |
| F-040 | P1 | Open dot; click to focus or minimize | [05](05-apps-and-taskbar.md) |
| F-041 | P1 | One icon per app, Store apps included | [05](05-apps-and-taskbar.md) |
| F-042 | P1 | Sharp icons | [05](05-apps-and-taskbar.md) |
| F-043 | P2 | Hover names | [05](05-apps-and-taskbar.md) |
| F-044 | P2 | Hover previews with title and close; rest shows window | [05](05-apps-and-taskbar.md) |
| F-045 | P2 | Jump lists | [05](05-apps-and-taskbar.md) |
| F-046 | P2 | Unpin, Close, Pin to dock, End task | [05](05-apps-and-taskbar.md) |
| F-047 | P2 | Start quick menu; Explorer Quick access | [05](05-apps-and-taskbar.md) |
| F-048 | P2 | Drag to pin; drag along; drag off to remove | [05](05-apps-and-taskbar.md) |
| F-049 | P3 | Files, folders and stacks on dock | [05](05-apps-and-taskbar.md) |
| F-050 | P3 | App groups | [05](05-apps-and-taskbar.md) |
| F-051 | P3 | Drag files over an app brings it forward | [05](05-apps-and-taskbar.md) |
| F-052 | P3 | Any app or folder as its own widget | [05](05-apps-and-taskbar.md) |
| F-053 | P3 | Own picture on Start tile | [05](05-apps-and-taskbar.md) |
| F-054 | P2 | Win+T app switching | [05](05-apps-and-taskbar.md) |

## Widget management

| ID | P | Feature | Doc |
| --- | --- | --- | --- |
| F-055 | P1 | Right-click dock menu | [06](06-widget-management.md) |
| F-056 | P1 | Picker with sidebar, categories, search, count | [06](06-widget-management.md) |
| F-057 | P1 | Live tiles in picker; click adds; click removes | [06](06-widget-management.md) |
| F-058 | P1 | − badges while open | [06](06-widget-management.md) |
| F-059 | P1 | Drag to reorder | [06](06-widget-management.md) |
| F-060 | P2 | Check marks; red new dots | [06](06-widget-management.md) |
| F-061 | P2 | Sample until connected | [06](06-widget-management.md) |

## Settings

| ID | P | Feature | Doc |
| --- | --- | --- | --- |
| F-062 | P1 | Mac-style Settings window | [07](07-settings.md) |
| F-063 | P1 | Appearance section | [07](07-settings.md) |
| F-064 | P1 | Dock section with info tips | [07](07-settings.md) |
| F-065 | P1 | Windows taskbar and Launch at startup | [07](07-settings.md) |
| F-066 | P2 | 12 or 24 hours; seconds | [07](07-settings.md) |
| F-067 | P2 | Hover names and previews switches | [07](07-settings.md) |
| F-068 | P3 | Version and update area | [07](07-settings.md) |

## Cards

| ID | P | Feature | Doc |
| --- | --- | --- | --- |
| F-069 | P1 | Open over widget with slide; never off-screen | [08](08-cards-and-interactions.md) |
| F-070 | P1 | Standard anatomy | [08](08-cards-and-interactions.md) |
| F-071 | P1 | Check again, Connect, Disconnect, Logout flows | [08](08-cards-and-interactions.md) |
| F-072 | P2 | Tile right-click menus | [08](08-cards-and-interactions.md) |
| F-073 | P2 | Toasts | [08](08-cards-and-interactions.md) |
| F-074 | P2 | Tooltips | [08](08-cards-and-interactions.md) |
| F-075 | P2 | Plain-language errors | [08](08-cards-and-interactions.md) |

## Automations

| ID | P | Feature | Doc |
| --- | --- | --- | --- |
| F-076 | P3 | Pause music before meetings | [07](07-settings.md) |
| F-077 | P3 | Warn before AI limit | [07](07-settings.md) |
| F-078 | P3 | Renewal reminders | [07](07-settings.md) |
| F-079 | P3 | Review requests to to-dos | [07](07-settings.md) |
| F-080 | P3 | Quiet hours | [07](07-settings.md) |
| F-081 | P3 | Alert tones | [07](07-settings.md) |
| F-082 | P3 | Unified calendar of renewals, payouts, limit resets | [08](08-cards-and-interactions.md) |
| F-083 | P3 | Screen Time daily and weekly summary | [08](08-cards-and-interactions.md) |

## Platform

| ID | P | Feature | Doc |
| --- | --- | --- | --- |
| F-084 | P1 | Provider runtime with cache and pause | [13](13-architecture.md) |
| F-085 | P1 | Secure key storage | [10](10-privacy-and-security.md) |
| F-086 | P1 | Windows 11 and 10 | [01](01-product.md) |
| F-087 | P2 | Launch at startup that reflects Task Manager | [07](07-settings.md) |
| F-088 | P3 | Works behind inspecting proxies | [09](09-integrations.md) |
| F-089 | P3 | 32-bit build | [01](01-product.md) |
| F-090 | P3 | Alt+T for to-dos | [08](08-cards-and-interactions.md) |

## Widgets

All 103 from the catalogue.

| ID | P | Widget | Category |
| --- | --- | --- | --- |
| W-001 | P1 | Claude Usage | [AI](widgets/ai.md) |
| W-002 | P1 | Claude Plan Usage | [AI](widgets/ai.md) |
| W-003 | P2 | ChatGPT Usage | [AI](widgets/ai.md) |
| W-004 | P2 | Gemini Usage | [AI](widgets/ai.md) |
| W-005 | P2 | Grok Usage | [AI](widgets/ai.md) |
| W-006 | P2 | DeepSeek Balance | [AI](widgets/ai.md) |
| W-007 | P2 | GLM Usage | [AI](widgets/ai.md) |
| W-008 | P2 | OpenCode Usage | [AI](widgets/ai.md) |
| W-009 | P2 | OpenCode Plan Usage | [AI](widgets/ai.md) |
| W-010 | P2 | Cursor Usage | [AI](widgets/ai.md) |
| W-011 | P2 | Day Timeline | [Productivity](widgets/productivity.md) |
| W-012 | P1 | Screen Time | [Productivity](widgets/productivity.md) |
| W-013 | P2 | Pomodoro | [Productivity](widgets/productivity.md) |
| W-014 | P2 | Timer | [Productivity](widgets/productivity.md) |
| W-015 | P2 | Stopwatch | [Productivity](widgets/productivity.md) |
| W-016 | P2 | Todos | [Productivity](widgets/productivity.md) |
| W-017 | P2 | Notes | [Productivity](widgets/productivity.md) |
| W-018 | P1 | Calendar | [Productivity](widgets/productivity.md) |
| W-019 | P2 | Currency | [Productivity](widgets/productivity.md) |
| W-020 | P2 | Total Revenue | [Finance](widgets/finance.md) |
| W-021 | P3 | Polar | [Finance](widgets/finance.md) |
| W-022 | P3 | Polar Chart | [Finance](widgets/finance.md) |
| W-023 | P1 | Stripe | [Finance](widgets/finance.md) |
| W-024 | P1 | Stripe Chart | [Finance](widgets/finance.md) |
| W-025 | P3 | Dodo Payments | [Finance](widgets/finance.md) |
| W-026 | P3 | Dodo Chart | [Finance](widgets/finance.md) |
| W-027 | P3 | Shopify | [Finance](widgets/finance.md) |
| W-028 | P3 | Shopify Chart | [Finance](widgets/finance.md) |
| W-029 | P3 | Lemon Squeezy | [Finance](widgets/finance.md) |
| W-030 | P3 | Lemon Squeezy Chart | [Finance](widgets/finance.md) |
| W-031 | P3 | Paddle | [Finance](widgets/finance.md) |
| W-032 | P3 | Paddle Chart | [Finance](widgets/finance.md) |
| W-033 | P3 | Gumroad | [Finance](widgets/finance.md) |
| W-034 | P3 | Gumroad Chart | [Finance](widgets/finance.md) |
| W-035 | P1 | System Stats | [System](widgets/system.md) |
| W-036 | P1 | Tray | [System](widgets/system.md) |
| W-037 | P2 | Language | [System](widgets/system.md) |
| W-038 | P2 | Temperature | [System](widgets/system.md) |
| W-039 | P2 | CPU | [System](widgets/system.md) |
| W-040 | P2 | RAM | [System](widgets/system.md) |
| W-041 | P2 | Network | [System](widgets/system.md) |
| W-042 | P1 | Battery | [System](widgets/system.md) |
| W-043 | P1 | Quick Toggles | [System](widgets/system.md) |
| W-044 | P2 | Brightness | [System](widgets/system.md) |
| W-045 | P2 | Theme Toggle | [System](widgets/system.md) |
| W-046 | P2 | Month Progress | [System](widgets/system.md) |
| W-047 | P2 | Day Progress | [System](widgets/system.md) |
| W-048 | P2 | Year Progress | [System](widgets/system.md) |
| W-049 | P1 | Now Playing | [Media & Audio](widgets/media-and-audio.md) |
| W-050 | P1 | Audio Output | [Media & Audio](widgets/media-and-audio.md) |
| W-051 | P2 | Now Playing (compact) | [Media & Audio](widgets/media-and-audio.md) |
| W-052 | P2 | Now Playing Mini | [Media & Audio](widgets/media-and-audio.md) |
| W-053 | P2 | Now Playing Bar | [Media & Audio](widgets/media-and-audio.md) |
| W-054 | P3 | DataFast Chart | [Analytics](widgets/analytics.md) |
| W-055 | P3 | Plausible | [Analytics](widgets/analytics.md) |
| W-056 | P3 | Dub | [Analytics](widgets/analytics.md) |
| W-057 | P3 | Resend | [Developer](widgets/developer.md) |
| W-058 | P3 | Linear | [Developer](widgets/developer.md) |
| W-059 | P3 | Supabase | [Developer](widgets/developer.md) |
| W-060 | P3 | Metric | [Online & Mail](widgets/online-and-mail.md) |
| W-061 | P3 | Wallpaper Gallery | [Online & Mail](widgets/online-and-mail.md) |
| W-062 | P2 | Gmail | [Online & Mail](widgets/online-and-mail.md) |
| W-063 | P1 | GitHub Activity | [Online & Mail](widgets/online-and-mail.md) |
| W-064 | P2 | GitHub | [Online & Mail](widgets/online-and-mail.md) |
| W-065 | P2 | GitHub Overview | [Online & Mail](widgets/online-and-mail.md) |
| W-066 | P3 | LeetCode Stats | [Online & Mail](widgets/online-and-mail.md) |
| W-067 | P3 | X Profile | [Social](widgets/social.md) |
| W-068 | P3 | TikTok | [Social](widgets/social.md) |
| W-069 | P3 | YouTube | [Social](widgets/social.md) |
| W-070 | P3 | Instagram | [Social](widgets/social.md) |
| W-071 | P1 | Apps | [Apps & Files](widgets/apps-and-files.md) |
| W-072 | P2 | Recently Opened | [Apps & Files](widgets/apps-and-files.md) |
| W-073 | P2 | Recycle Bin | [Apps & Files](widgets/apps-and-files.md) |
| W-074 | P2 | Search | [Apps & Files](widgets/apps-and-files.md) |
| W-075 | P2 | Commands | [Apps & Files](widgets/apps-and-files.md) |
| W-076 | P2 | Storage | [Apps & Files](widgets/apps-and-files.md) |
| W-077 | P2 | Recent Screenshots | [Apps & Files](widgets/apps-and-files.md) |
| W-078 | P2 | Downloads | [Apps & Files](widgets/apps-and-files.md) |
| W-079 | P2 | Screenshot Capture | [Apps & Files](widgets/apps-and-files.md) |
| W-080 | P2 | Weather | [Weather](widgets/weather.md) |
| W-081 | P2 | Weather Details | [Weather](widgets/weather.md) |
| W-082 | P2 | Weather Forecast | [Weather](widgets/weather.md) |
| W-083 | P2 | Today & Forecast | [Weather](widgets/weather.md) |
| W-084 | P2 | Weather Status | [Weather](widgets/weather.md) |
| W-085 | P2 | Hourly | [Weather](widgets/weather.md) |
| W-086 | P2 | Sunrise & Sunset | [Weather](widgets/weather.md) |
| W-087 | P3 | Stock | [Stocks](widgets/stocks.md) |
| W-088 | P3 | Stock Chart | [Stocks](widgets/stocks.md) |
| W-089 | P3 | Stock Watchlist | [Stocks](widgets/stocks.md) |
| W-090 | P1 | Clock | [Clocks](widgets/clocks.md) |
| W-091 | P2 | Flip Clock | [Clocks](widgets/clocks.md) |
| W-092 | P2 | World Clocks | [Clocks](widgets/clocks.md) |
| W-093 | P2 | Analog Classic | [Clocks](widgets/clocks.md) |
| W-094 | P2 | Analog Classic Dark | [Clocks](widgets/clocks.md) |
| W-095 | P2 | 7 Days | [Clocks](widgets/clocks.md) |
| W-096 | P2 | World Clock | [Clocks](widgets/clocks.md) |
| W-097 | P2 | World Time | [Clocks](widgets/clocks.md) |
| W-098 | P1 | Today | [Clocks](widgets/clocks.md) |
| W-099 | P2 | Date | [Clocks](widgets/clocks.md) |
| W-100 | P2 | Day Number | [Clocks](widgets/clocks.md) |
| W-101 | P2 | Analog Minimal | [Clocks](widgets/clocks.md) |
| W-102 | P2 | Segment Clock | [Clocks](widgets/clocks.md) |
| W-103 | P1 | Clock & Weather | [Clocks](widgets/clocks.md) |

Totals: 90 features and 103 widgets (17 P1, 58 P2, 28 P3). Extra tiles not in the catalogue are G-14.
