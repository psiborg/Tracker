# Tracker — GPS Activity Tracker

> **Live app:** [psiborg.github.io/Tracker](https://psiborg.github.io/Tracker)  
> **Repository:** [github.com/psiborg/Tracker](https://github.com/psiborg/Tracker)

A Progressive Web App (PWA) for recording hiking and outdoor activities with real-time GPS tracking, route visualization, and activity history. Works fully offline after the first load and can be installed to the home screen on iOS and Android.

---

## Features

- **Real-time GPS tracking** — live crosshair marker follows every position fix; accuracy circle shows GPS precision
- **Smooth route line** — track path drawn using an Exponential Moving Average (EMA) filter to reduce GPS jitter; can be disabled in Settings
- **2 base map layers** — OpenStreetMap and OpenTopoMap
- **Overlay layers** — Waymarked Hiking Trails, Cycling Routes, and a per-activity path layer added automatically after each save
- **Offline Maps** — bulk-download tiles for a named area before heading out; manage saved areas with rename, zoom-to, and delete
- **Compass rose** — top-left map control showing live bearing in degrees and 16-point direction (e.g. `275° WNW`), fed by Device Orientation API when stationary
- **Re-center button** — appears when the map is panned away from the current GPS location; taps back to live following
- **10-field info dashboard** — Date, Time, Latitude, Longitude, Speed, Accuracy, Distance, Altitude, Heading, Map Zoom
- **Start / Pause / Stop** — Start and Pause share a single toggle button; a blinking REC indicator sits above the map scale bar
- **Activity history** — saved activities listed with name, date, distance, and duration; tap to view all data points; delete with the ✕ icon
- **Saved path overlays** — each activity's route is registered as a named overlay layer and persists across sessions
- **Settings** — smooth lines toggle, jitter filter slider, record interval, GPS poll rate, and accuracy filter; all persisted to `localStorage`
- **Light / Dark theme** — toggle from the hamburger menu; defaults to dark
- **About dialog** — shows app version, active service worker cache name, and a link to the GitHub repository
- **Fully offline** — all library and font assets are bundled locally; map tiles are cached by the service worker as they are viewed
- **PWA installable** — add to home screen on iOS Safari and Android Chrome for a full-screen native experience

---

## Project Structure

```
tracker/
├── index.html              # App shell — structure only, no inline CSS or JS
├── app.css                 # All application styles and CSS custom properties
├── app.js                  # All application logic (IIFE, strict mode)
├── manifest.json           # PWA manifest (name, icons, display mode)
├── sw.js                   # Service worker — precaches assets, caches map tiles
├── README.md
│
├── lib/                    # Bundled third-party libraries (no CDN dependency)
│   ├── leaflet.min.css     # Leaflet 1.9.4 styles
│   ├── leaflet.min.js      # Leaflet 1.9.4 library
│   ├── fonts.css           # @font-face declarations pointing to local woff2 files
│   └── images/             # Leaflet marker and layer-switcher sprites
│       ├── layers.png
│       ├── layers-2x.png
│       ├── marker-icon.png
│       ├── marker-icon-2x.png
│       └── marker-shadow.png
│
└── fonts/                  # Bundled web fonts (no Google Fonts CDN dependency)
    ├── rajdhani-latin-400-normal.woff2
    ├── rajdhani-latin-500-normal.woff2
    ├── rajdhani-latin-600-normal.woff2
    ├── rajdhani-latin-700-normal.woff2
    └── share-tech-mono-latin-400-normal.woff2
```

---

## Deployment

The app requires only a static HTTPS file server — no build step, no back-end.

### Option A — GitHub Pages

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/psiborg/Tracker.git
git push -u origin main
```

Enable Pages under **Settings → Pages → Source: main branch / root**.

### Option B — Netlify / Vercel

Drag and drop the `tracker/` folder into the Netlify or Vercel dashboard. Both serve over HTTPS automatically.

### Option C — Local development server

```bash
# Python (built into macOS and Linux)
python3 -m http.server 8080
# then open http://localhost:8080
```

> **HTTPS is required in production.** The Geolocation API and Service Worker are blocked on plain HTTP. `localhost` is the only exception and is suitable for development.

### Forcing a cache refresh (iOS Safari)

After deploying updated files, bump the `CACHE_NAME` constant in `sw.js` (e.g. `tracker-v3` → `tracker-v4`). The service worker's activate handler automatically deletes the old cache. On device, open the URL in Safari, pull to refresh once, close the tab fully, then reopen it.

Alternatively, clear site data manually: **Settings → Safari → Advanced → Website Data → search your domain → swipe to delete**.

---

## Installing to Home Screen

### iOS (Safari)
1. Open the app URL in Safari
2. Tap the **Share** button (box with arrow)
3. Tap **Add to Home Screen**
4. Confirm the name and tap **Add**

### Android (Chrome)
1. Open the app URL in Chrome
2. Tap the **⋮** menu → **Add to Home screen**, or tap the **Install** prompt in the address bar
3. Tap **Install**

---

## Usage

### Toolbar

| Button | State | Action |
|--------|-------|--------|
| **Start** | Idle | Begins recording; button becomes **Pause** |
| **Pause** | Recording | Suspends recording; button reverts to **Start** (resume) |
| **Start** | Paused | Resumes recording; button becomes **Pause** again |
| **Stop** | Recording or paused | Ends the activity; prompts for a name before saving |
| **History** | Any | Opens the activity history modal |

### Map Controls

| Control | Location | Purpose |
|---------|----------|---------|
| Layer switcher | Top-right | Switch base map; toggle trail and activity overlays |
| Compass rose | Top-left | Live bearing; rotates needle to current heading |
| Re-center button | Bottom-center | Returns map to current GPS location and resumes following |
| Zoom +/− | Bottom-right | Zoom in and out |
| Scale bar | Bottom-left | Map scale reference |

### Menu (☰)

| Item | Action |
|------|--------|
| Switch Theme | Toggle between Light and Dark mode |
| Settings | Open the recording settings dialog |
| Download Area | Open the Offline Maps dialog to cache tiles for offline use |
| About | Show version, cache name, and GitHub link |

---

## Info Dashboard Reference

| Field | Description |
|-------|-------------|
| Date | Current date `yyyy/mm/dd` |
| Time | Current time `hh:mm:ss` (live clock) |
| Latitude | GPS latitude, 6 decimal places |
| Longitude | GPS longitude, 6 decimal places |
| Speed | Ground speed in km/h (GPS, only while moving) |
| Accuracy | GPS horizontal accuracy in metres |
| Distance | Total distance recorded in the current session (km) |
| Altitude | GPS altitude in metres above sea level (hardware dependent) |
| Heading | Bearing in degrees and 8-point cardinal label; falls back to device compass when stationary |
| Map Zoom | Current Leaflet map zoom level |

---

## Settings Reference

### Recording
| Setting | Default | Description |
|---------|---------|-------------|
| Smooth Route Lines | On | Apply EMA filter to the drawn path to reduce GPS jitter |
| Jitter Filter | 3 m | Minimum movement before a point is recorded; 0 = record all |

### Data Points
| Setting | Default | Description |
|---------|---------|-------------|
| Record Interval | 5 s | How often a point is saved to the activity; lower = more detail and more storage |
| GPS Poll Rate | 1 s | How frequently the GPS hardware is queried for a new position |
| Accuracy Filter | 50 m | Discard points with GPS accuracy worse than this value |

Settings are persisted to `localStorage` under the key `tracker_settings` and restored on every launch.

---

## Map Layers

### Base Maps
| Layer | Source | Max Zoom |
|-------|--------|----------|
| 🗺 OpenStreetMap | openstreetmap.org | 19 |
| 🏔 OpenTopoMap | opentopomap.org | 17 |

### Built-in Overlays
| Layer | Source |
|-------|--------|
| 🥾 Hiking Trails | waymarkedtrails.org |
| 🚴 Cycling Routes | waymarkedtrails.org |

### Activity Overlays
Each saved activity with at least 2 recorded points is automatically registered as a named overlay layer (`📍 Activity Name`) in the layer switcher. Layers are colour-coded and persist across sessions. Deleting an activity from History removes its overlay layer.

---

## Offline Maps

The **Offline Maps** dialog (☰ → Download Area) lets you pre-cache map tiles for a specific geographic area so the app works without an internet connection.

### Download tab

1. Enter a name for the area (e.g. *Bruce Trail North*)
2. Select which map layers to cache (OpenStreetMap and/or OpenTopoMap)
3. Set the zoom range — Min Zoom (overview, default 10) and Max Zoom (detail, default 16)
4. The **live estimate** shows the approximate tile count and storage size; downloads above 3,000 tiles are blocked with a prompt to zoom in or narrow the range
5. Tap **Download** — a progress bar tracks the fetch; tap **Stop** to cancel mid-download (already-fetched tiles remain cached)
6. On completion the modal switches automatically to the Saved Areas tab

### Tile count reference

| Zoom | Coverage per tile | Typical use |
|------|------------------|-------------|
| 10 | ~78 km² | Regional overview |
| 12 | ~5 km² | Town / park level |
| 14 | ~1.2 km² | Trail network |
| 16 | ~0.3 km² | Full street / path detail |

A typical 10 km hiking route cached at zooms 10–16 on both layers is roughly 300–600 tiles (~5–9 MB).

### Saved Areas tab

Each completed download is saved as a named area record. For each area you can:

| Action | Description |
|--------|-------------|
| ✏ **Rename** | Tap the pencil icon; edit inline; confirm with Enter or blur |
| 🔍 **Zoom to** | Frames the downloaded bounding box on the map and closes the dialog |
| 🗑 **Delete** | Removes the area record; cached tiles are retained in the service worker cache (they may overlap with other areas) |

Area metadata is stored under the `localStorage` key `tracker_dl_areas`. Cached tiles live in the service worker's `tracker-tiles` cache and are served automatically when offline.

---

## Data Storage

Activity data is stored in `localStorage` under the key `tracker_activities`. Points are saved in a compact format to minimise storage usage.

### Compact point format

| Key | Field | Notes |
|-----|-------|-------|
| `a` | Latitude | 5 decimal places (~1 m accuracy) |
| `o` | Longitude | 5 decimal places |
| `t` | Timestamp | Unix ms |
| `l` | Altitude | Integer metres; omitted if null |
| `c` | Accuracy | 1 decimal place metres; omitted if null |
| `s` | Speed | km/h, 1 decimal place; omitted if null |
| `h` | Heading | Integer degrees; omitted if null |

### Storage estimate

| Record interval | Points/hour | Per activity | 60 activities |
|----------------|-------------|-------------|---------------|
| 1 s | 3,600 | ~137 KB | ~8 MB |
| 5 s (default) | 720 | ~27 KB | ~1.6 MB |
| 10 s | 360 | ~14 KB | ~0.8 MB |

`localStorage` is capped at 5–10 MB depending on the browser. At the default 5 s interval, ~180 one-hour activities fit comfortably within a 5 MB budget.

### Storage keys

| Key | Contents |
|-----|----------|
| `tracker_activities` | JSON array of all saved activity records |
| `tracker_settings` | JSON object of user settings |
| `tracker_dl_areas` | JSON array of downloaded area metadata records |

---

## Dependencies

All dependencies are bundled locally. No internet connection is required after the first page load.

| Dependency | Version | License | Location |
|------------|---------|---------|----------|
| [Leaflet](https://leafletjs.com) | 1.9.4 | BSD-2-Clause | `lib/` |
| [Rajdhani](https://fonts.google.com/specimen/Rajdhani) (font) | — | OFL-1.1 | `fonts/` |
| [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono) (font) | — | OFL-1.1 | `fonts/` |

Map tile data is provided by third-party services subject to their own terms:
- © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- © [OpenTopoMap](https://opentopomap.org) (CC-BY-SA 3.0)
- © [Waymarked Trails](https://waymarkedtrails.org) (CC-BY-SA 3.0)

---

## Browser Compatibility

| Browser | Version | Notes |
|---------|---------|-------|
| Safari (iOS) | 16.4+ | Full PWA install support; Device Orientation requires user permission |
| Chrome (Android) | 90+ | Full PWA install support |
| Chrome (Desktop) | 90+ | GPS via IP geolocation; mock GPS available on `file://` |
| Firefox | 90+ | PWA install not supported; app functions normally |
| Edge | 90+ | Full PWA install support |

---

## License

MIT — see [LICENSE](LICENSE) for details.
