# 06. Adding, removing and arranging widgets

There are "no skins, no config files and no layout editor": a picker and dragging are the whole system [S: guides/what-is-lumabar].

## The picker

Opened with right-click the dock → **Widgets…** [S: docs]. It's a large centred dark window over the desktop, with the dock still visible below [O: widgets-preview].

| Part | Detail | Source |
| --- | --- | --- |
| Search | Field at the top of the sidebar, `Search widgets` | [O: widgets-preview] |
| Sidebar | All Widgets, Clocks, Productivity, System, Apps & Files, Media & Audio, AI, Analytics, Social, Stocks, Finance, Weather, Online & Mail; each with a small colour icon | [O: widgets-preview] |
| Selected row | Solid accent blue pill | [O: widgets-preview] |
| Scrolling | Sidebar stays while scrolling; click a category to jump | [S: changelog 1.1.1] |
| Header | `All Widgets`, a count pill, `10 in bar`, close button | [O: widgets-preview] |
| Sections | Category icon and name, then wrapping rows of live tiles | [O: widgets-preview] |
| Tile | The real widget with its name centred below | [O: widgets-preview] |
| In the dock | Check mark on widgets already added | [S: changelog 1.2.8] |
| New | Red dot marks what's new | [S: changelog 1.2.6] |
| Apps | Lists every installed app under Apps & Files | [S: changelog 1.2.6, 1.2.10] |

## Add

1. Open the picker [S: docs]
2. Browse a category or search [S: docs]
3. Click a tile; it joins the dock [S: docs]

Where a new tile lands isn't published: Gap G-12.

## Remove

Any of these [S: docs] [S: changelog 1.0.0]:

- Click the tile again in the picker [S: docs]
- Click the red − badge on the dock; every widget shows one while the picker is open [O: widgets-preview]
- Drag an icon off the dock [S: changelog 1.0.0]

Removing animates away [S: changelog 0.1.11], and its requests stop [S: docs].

## Arrange

- Drag any widget along the dock [S: docs]
- With Lock dock on, moving only works while the picker is open [S: changelog 1.2.4]
- Drag the dock itself from a gap or empty spot [S: changelog 1.0.2]

## Duplicates and sizes

- Widgets come in fixed shapes, not resizable tiles; variants such as Now Playing Bar are separate widgets [S: widgets] [I]
- Whether a widget can be added twice isn't published: G-12

## Widget-level settings

- Each widget's settings live on its card, or its right-click menu [S: docs] [S: connect-stocks]
- Examples: Change stock…, Edit watchlist…, Logout, pin an app in Screen Time, choose toggles [S: connect-stocks] [S: guides/screen-time-windows] [S: changelog 0.1.13]
- So there's no global page of widget settings [I]

## Connecting accounts

- A tile that needs an account shows a sample until connected [S: docs]
- Click it; the card says what it needs and links to a guide [S: docs] [S: changelog 1.0.2]
- Connect checks the key with one real read [S: connect pages]
- Disconnect on the card, or Logout on the tile's right-click [S: connect pages]
