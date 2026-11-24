# Weather widgets

7 widgets. Tags and the template are explained in [the README](../README.md).

### Weather

| Field | Detail |
| --- | --- |
| **Category** | Weather [S: widgets] |
| **Tile shows** | Large glyph, temperature, `H 41° L 29°` [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 292×154 px in the capture, wide (1.90:1) [M] |
| **Layout** | Radius 38 px, rim #fefefe at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | City choice [S: changelog 0.1.7]; rest Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Unnamed weather service (G-03) |
| **Refresh** | Gap (G-03) |
| **Setup** | Pick a city [S: changelog 0.1.7] |
| **Captures** | `_evidence/assets/weather-dark-t6W67ILN.webp`, `_evidence/assets/weather-light-B4EaCYDQ.webp` [O] |
| **Buildable here?** | Yes; Shelf uses Open-Meteo [I] |

### Weather Details

| Field | Detail |
| --- | --- |
| **Category** | Weather [S: widgets] |
| **Tile shows** | Glyph, temperature, condition, divider; wind, rain, H/L rows with icons [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 514×154 px in the capture, wide (3.34:1) [M] |
| **Layout** | Radius 39 px, rim #fefefe at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Weather service [I] |
| **Refresh** | Gap (G-03) |
| **Setup** | City [I] |
| **Captures** | `_evidence/assets/weather-details-dark-B2Ln8XR5.webp`, `_evidence/assets/weather-details-light-CeEDZMqT.webp` [O] |
| **Buildable here?** | Yes [I] |

### Weather Forecast

| Field | Detail |
| --- | --- |
| **Category** | Weather [S: widgets] |
| **Tile shows** | Four day columns: name, glyph, high, low [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 550×154 px in the capture, wide (3.57:1) [M] |
| **Layout** | Radius 39 px, rim #fefefe at 16%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Weather service [I] |
| **Refresh** | Gap (G-03) |
| **Setup** | City [I] |
| **Captures** | `_evidence/assets/weather-forecast-dark-Bz2_xIOP.webp`, `_evidence/assets/weather-forecast-light-BDw42Ohu.webp` [O] |
| **Buildable here?** | Yes [I] |

### Today & Forecast

| Field | Detail |
| --- | --- |
| **Category** | Weather [S: widgets] |
| **Tile shows** | Today's glyph and temperature, divider, three day columns [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 614×154 px in the capture, wide (3.99:1) [M] |
| **Layout** | Radius 36 px, rim #fefefe at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Weather service [I] |
| **Refresh** | Gap (G-03) |
| **Setup** | City [I] |
| **Captures** | `_evidence/assets/today-and-forecast-dark-B9xBAUxr.webp`, `_evidence/assets/today-and-forecast-light-VkCokpq0.webp` [O] |
| **Buildable here?** | Yes [I] |

### Weather Status

| Field | Detail |
| --- | --- |
| **Category** | Weather [S: widgets] |
| **Tile shows** | Large glyph, condition, `Dubai · 36° · H 41° L 29°` [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 450×154 px in the capture, wide (2.92:1) [M] |
| **Layout** | Radius 37 px, rim #ffffff at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 10%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Weather service [I] |
| **Refresh** | Gap (G-03) |
| **Setup** | City [I] |
| **Captures** | `_evidence/assets/weather-status-dark-DtIFH3rU.webp`, `_evidence/assets/weather-status-light-jk4_vu_v.webp` [O] |
| **Buildable here?** | Yes [I] |

### Hourly

| Field | Detail |
| --- | --- |
| **Category** | Weather [S: widgets] |
| **Tile shows** | Six hour columns; first `Now` highlighted [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 642×154 px in the capture, wide (4.17:1) [M] |
| **Layout** | Radius 35 px, rim #fefefe at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Weather service [I] |
| **Refresh** | Gap (G-03) |
| **Setup** | City [I] |
| **Captures** | `_evidence/assets/hourly-dark-CbEn4lQT.webp`, `_evidence/assets/hourly-light-CSUf6r65.webp` [O] |
| **Buildable here?** | Yes [I] |

### Sunrise & Sunset

| Field | Detail |
| --- | --- |
| **Category** | Weather [S: widgets] |
| **Tile shows** | Arc with sun marker; sunrise and sunset times with icons [O] |
| **States** | Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02). |
| **Tile size** | 468×154 px in the capture, wide (3.04:1) [M] |
| **Layout** | Radius 35 px, rim #fefefe at 15%, fill #ffffff at 5.5% in dark. Light: rim #000000 at 9%, fill #000000 at 4.3% [M] |
| **Card** | Gap (G-04) |
| **Click** | Gap (G-04) |
| **Data source** | Weather service or calculated from the city [I] |
| **Refresh** | Gap (G-03) |
| **Setup** | City [I] |
| **Captures** | `_evidence/assets/sunrise-and-sunset-dark-9TnvfGbP.webp`, `_evidence/assets/sunrise-and-sunset-light-CJ8Mr1fM.webp` [O] |
| **Buildable here?** | Yes [I] |
