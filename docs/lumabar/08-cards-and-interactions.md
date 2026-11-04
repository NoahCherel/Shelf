# 08. Cards and interactions

A **card** is a widget's detail window. Clicking a tile opens it [S: docs].

## Behaviour

- Opens right over the widget, not centred on the dock [S: changelog 1.2.5]
- Slides out of the bar [S: changelog 1.2.5]
- Opens downward when the dock is on top [S: docs]
- Never opens past the top of a small screen [S: changelog 1.2.10]
- Height fits what it shows [S: changelog 1.0.1]
- Stays open while a tray app's menu is up [S: changelog 1.0.1]
- Right-click inside a card behaves, and doesn't close the picker [S: changelog 0.1.11]
- How a card closes on clicking away isn't stated; the X button is shown [O: ai-cards]. See G-12

## Standard card anatomy

From the AI cards [O: ai-cards]:

| Part | Detail |
| --- | --- |
| Header | Logo tile, bold name, plan pill (e.g. `Plus`, `Max 5x`), close X, divider below [O: ai-cards] |
| Body | Rows: bold label, right-aligned `resets 2h 8m`, bold percent, then a thick green bar [O: ai-cards] |
| Footer | Small grey source note, e.g. `Read from your ChatGPT sign-in.`, and a button [O: ai-cards] |
| Button | `Refresh`, or red `Disconnect` for keys [O: ai-cards] |

A chart showing how a limit was used and where it's heading was added later [S: changelog 1.2.10].

## Larger cards

| Card | Contents | Source |
| --- | --- | --- |
| Claude | USAGE and SUBSCRIPTION sections | [O: for-developers] |
| Calendar | Month grid and day list; see below | [O: calendar-dark-1560] |
| Screen Time | Two columns; see below | [O: screen-time-preview] |
| Sound | iOS style: volume slider, per-app volumes, outputs checklist | [S: changelog 1.2.10] |
| Storage | Drive switcher, space breakdown | [S: changelog 1.2.10] |
| Search Console | Clicks, impressions and chart; top queries and pages; URL inspection | [S: changelog 1.2.10] [S: connect-search-console] |
| Gmail | Inbox list with Unread, Inbox and Starred, search | [S: connect-gmail] |
| Quick Toggles | The "Quick Toggles look" other cards follow | [S: changelog 1.0.1] |
| Weather and others | Not shown publicly: G-04 | [O] |

### Calendar card

- Title `October, 2026`; `Calendars` pill; `Today`; arrows; close [O: calendar-dark-1560]
- Legend: Renewals, Payouts, Events, All day, Due dates, Limit resets [O: calendar-dark-1560]
- Monday-first grid of rounded day tiles; past days dimmed; today outlined in accent [O: calendar-dark-1560]
- Day tiles show source logos and a coloured dot; two logos then +N [O: calendar-dark-1560] [S: changelog 1.1.1]
- Right panel: day name, count, list with time, icon, title, source and location [O: calendar-dark-1560]
- Add row: time picker, `New event today (N)`, plus button [O: calendar-dark-1560]

### Screen Time card

- Day and Week segmented control; close [O: screen-time-preview]
- Date navigation; large total; difference from yesterday [O: screen-time-preview]
- Hourly bars with 30m and 60m lines, 12a to 6p axis, blue on dark stacked [O: screen-time-preview]
- Longest focus, App switches, First use [O: screen-time-preview]
- Right list: MOST USED, Apps or Websites, icon, name, time, bar, pin [O: screen-time-preview]
- Footer: daily summary, time stepper, green switch [O: screen-time-preview]

## Right-click

| Where | What | Source |
| --- | --- | --- |
| Dock | Widgets…, Settings | [S: docs] |
| Account tile | Logout | [S: connect pages] |
| Stock tile | Change stock… or Edit watchlist… | [S: connect-stocks] |
| App | See [Apps](05-apps-and-taskbar.md) | [S: changelog 1.2.6] |

Rows highlight at once [S: changelog 1.2.10]. Full menu contents: G-12.

## Keyboard and pointer

| Input | Action | Source |
| --- | --- | --- |
| Alt+T | Opens To Do from anywhere | [S: changelog 0.1.14] |
| Win+T | App switcher | [S: changelog 1.2.0] |
| N | New event, per the field label | [O: calendar-dark-1560] |
| Scroll on Audio Output | Volume | [S: changelog 0.1.14] |
| Scroll on dock | Sideways | [S: changelog 1.2.10] |
| Double-click dock end | Undo narrowing | [S: changelog 1.0.1] |

Alt must not freeze the dock [S: changelog 1.0.0].

## Toasts and summaries

- Update toast with progress [S: changelog 1.2.0]
- Screen Time's daily summary appears above the dock, Mondays cover the week, Details opens the card [S: guides/screen-time-windows]
- Automations warn before limits and renewals [S: changelog 1.1.0]

## Error messages

Written in plain language rather than raw connection errors [S: changelog 0.1.8]. Examples are in [integrations](09-integrations.md).

## Tooltip

A dark floating label above the tile is shown in one image, naming the widget [O: screentime-dark-1600].
