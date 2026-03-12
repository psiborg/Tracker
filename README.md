# Tracker — GPS Activity Tracker

A Progressive Web App (PWA) for recording hiking and outdoor activities with real-time GPS tracking, route visualization, and activity history. Works fully offline after the first load and can be installed to the home screen on iOS and Android.

---

## Features

- **Real-time GPS tracking** — live crosshair marker updates on every position fix
- **Smooth route line** — track path drawn using an Exponential Moving Average (EMA) filter to reduce GPS jitter
- **4 base map layers** — OpenStreetMap, OpenTopoMap, Stadia Outdoors, and Stadia Satellite
- **2 overlay layers** — Waymarked Hiking Trails and Cycling Routes
- **Compass rose** — top-left map control showing live heading degrees and 16-point direction (e.g. `275° WNW`)
- **10-field info dashboard** — Date, Time, Latitude, Longitude, Speed, Accuracy, Distance, Altitude, Heading, Map Zoom
- **Activity recording** — Start, Pause, and Stop controls with a live REC indicator
- **Activity history** — saved activities listed with name, date, distance, and duration; each activity shows a scrollable list of all recorded GPS data points
- **Light / Dark theme** — toggle from the hamburger menu; defaults to dark
- **Fully offline** — all library and font assets are bundled locally; map tiles are cached by the service worker as they are viewed
- **PWA installable** — add to home screen on iOS Safari and Android Chrome for a full-screen native-like experience

---

## Project Structure

```
tracker/
├── index.html              # App shell — structure only, no inline CSS or JS
├── app.css                 # All application styles and CSS custom properties
├── app.js                  # All application logic (IIFE, strict mode)
├── manifest.json           # PWA manifest (name, icons, display mode)
├── sw.js                   # Service worker — precaches assets, caches map tiles
│
├── lib/                    # Bundled third-party library (no CDN dependency)
│   ├── leaflet.min.css     # Leaflet 1.9.4 styles
│   ├── leaflet.min.js      # Leaflet 1.9.4 library
│   ├── fonts.css           # @font-face declarations for local fonts
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
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Enable Pages under **Settings → Pages → Source: main branch / root**.

### Option B — Netlify / Vercel

Drag and drop the `tracker/` folder into the Netlify or Vercel dashboard. Both will serve it over HTTPS automatically.

### Option C — Any HTTPS server

```bash
# Python quick-server (for local testing only — GPS requires HTTPS in production)
python3 -m http.server 8080
```

> **HTTPS is required.** The Geolocation API and Service Worker are both blocked by browsers on plain HTTP (except `localhost`).

---

## Installing to Home Screen

### iOS (Safari)
1. Open the app URL in Safari
2. Tap the **Share** button (box with arrow)
3. Tap **Add to Home Screen**
4. Confirm the name and tap **Add**

### Android (Chrome)
1. Open the app URL in Chrome
2. Tap the **⋮** menu → **Add to Home screen**
3. Or tap the **Install** prompt that appears in the address bar
4. Tap **Install**

---

## Usage

| Button | Action |
|--------|--------|
| **Start** | Begins recording GPS data points, distance, and draws the route line |
| **Pause** | Suspends recording without ending the activity; tap again to resume |
| **Stop** | Ends recording and prompts for an activity name before saving |
| **History** | Opens the history modal — select an activity on the left to view its data points on the right |

The **layer control** (top-right of map) switches base maps and toggles trail overlays.
The **hamburger menu** (top-right of header) switches between Light and Dark themes and shows the About screen.

---

## Info Dashboard Reference

| Field | Description |
|-------|-------------|
| Date | Current date `yyyy/mm/dd` |
| Time | Current time `hh:mm:ss` (live clock) |
| Latitude | GPS latitude in decimal degrees |
| Longitude | GPS longitude in decimal degrees |
| Speed | Ground speed in km/h |
| Accuracy | GPS horizontal accuracy in metres |
| Distance | Total distance recorded in the current session (km) |
| Altitude | GPS altitude in metres above sea level |
| Heading | Travel direction in degrees and 8-point cardinal label |
| Map Zoom | Current Leaflet map zoom level |

> **Note:** Speed and Heading are provided by the device GPS and are only available while the device is moving. Values show `—` when stationary or when the GPS has not yet acquired a fix.

---

## Map Layers

### Base Maps
| Layer | Source | Max Zoom |
|-------|--------|----------|
| OpenStreetMap | openstreetmap.org | 19 |
| OpenTopoMap | opentopomap.org | 17 |
| Stadia Outdoors | stadiamaps.com | 20 |
| Stadia Satellite | stadiamaps.com | 20 |

### Overlays
| Layer | Source |
|-------|--------|
| Hiking Trails | waymarkedtrails.org |
| Cycling Routes | waymarkedtrails.org |

---

## Data Storage

All activity data is stored in the browser's `localStorage` under the key `tracker_activities` as a JSON array. Each activity record contains:

```json
{
  "id": 1710000000000,
  "name": "Morning Hike",
  "date": "2026/03/12",
  "duration": 3600000,
  "distance": 5.42,
  "points": [
    {
      "lat": 43.527521,
      "lon": -80.153917,
      "alt": 367,
      "acc": 11.61,
      "speed": 1.39,
      "heading": 105,
      "ts": 1710000000000
    }
  ]
}
```

Data persists across sessions until the browser storage is cleared. There is no server sync — data lives on the device only.

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
- © [Stadia Maps](https://stadiamaps.com) / OpenMapTiles
- © [Waymarked Trails](https://waymarkedtrails.org) (CC-BY-SA 3.0)

---

## Browser Compatibility

| Browser | Version | Notes |
|---------|---------|-------|
| Safari (iOS) | 16.4+ | Full PWA install support |
| Chrome (Android) | 90+ | Full PWA install support |
| Chrome (Desktop) | 90+ | GPS may require permission prompt |
| Firefox | 90+ | PWA install not supported; app runs normally |
| Edge | 90+ | Full PWA install support |

---

## License

Apache 2 — see [LICENSE](LICENSE) for details.
