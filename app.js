/* ============================================================
   Tracker — GPS Activity Tracker
   app.js
   ============================================================ */

(function () {
  'use strict';

  // ── Shorthand ─────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── App State ─────────────────────────────────────────────
  let isDark        = true;
  let isRecording   = false;
  let isPaused      = false;
  let currentPoints = [];   // raw GPS points
  let smoothedPoints= [];   // EMA-smoothed for polyline
  let totalDistance = 0;
  let lastGoodPos   = null;   // filtered pos for distance calc (acc < 50 m)
  let lastPos       = null;   // always-updated latest GPS fix
  let watchId       = null;
  let clockInterval = null;
  let recStartTime  = null;
  let deviceHeading    = null;   // compass heading from Device Orientation API (fallback)
  let lastRecordedTs   = 0;      // timestamp of the last recorded point (throttle)

  // ── Settings State ────────────────────────────────────────
  const SETTINGS_KEY = 'tracker_settings';

  const SETTINGS_DEFAULTS = {
    smoothLines:   true,
    jitterFilter:  0.003,  // km (3 m)
    gpsInterval:   1000,   // ms — watchPosition maximumAge
    pointInterval: 5000,   // ms — minimum gap between recorded points (5 s default)
    accFilter:     50,     // m
  };

  // Load persisted settings, falling back to defaults for any missing key
  function loadSettings() {
    try {
      const saved = JSON.parse(storage.get(SETTINGS_KEY) || '{}');
      return Object.assign({}, SETTINGS_DEFAULTS, saved);
    } catch (e) {
      return Object.assign({}, SETTINGS_DEFAULTS);
    }
  }

  function saveSettings() {
    try {
      storage.set(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Could not persist settings:', e);
    }
  }

  // Apply loaded values to the settings object (mutable so other code can read it)
  const settings = loadSettings();

  // ── Storage Abstraction ──────────────────────────────────
  // On file:// localStorage may be blocked; fall back to in-memory store.
  const _memStore = {};
  const storage = {
    get(key) {
      try { return localStorage.getItem(key); }
      catch(e) { return _memStore[key] ?? null; }
    },
    set(key, val) {
      try { localStorage.setItem(key, val); }
      catch(e) { _memStore[key] = val; }
    },
  };

  // ── Map Objects ───────────────────────────────────────────
  let map, crosshairMarker, trackLine, accuracyCircle, compassControl, layerControl;
  let mapInitialized = false;
  const activityLayers = {};   // id → L.Polyline, kept in sync with saved activities
  let userPanned     = false;   // true when user has manually moved the map

  // ── SVG Icons ─────────────────────────────────────────────
  const SVG_SUN  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1"  x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1"  y1="12" x2="3"  y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>`;

  const SVG_MOON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`;

  // ── Map Initialisation ────────────────────────────────────
  function initMap(lat, lon) {
    map = L.map('map', {
      center: [lat, lon],
      zoom: 15,
      zoomControl: false,
      attributionControl: true,
    });

    // ── Base Layers ──────────────────────────────────────────
    const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    });

    const openTopoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    });

    const stadiaOutdoors = L.tileLayer('https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.{ext}', {
      minZoom: 0,
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      ext: 'png',
    });

    const stadiaSatellite = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.{ext}', {
      minZoom: 0,
      maxZoom: 20,
      attribution: '&copy; CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data) | &copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      ext: 'jpg',
    });

    // ── Overlay Layers ───────────────────────────────────────
    const waymarkedHiking = L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Map style: &copy; <a href="https://waymarkedtrails.org">waymarkedtrails.org</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    });

    const waymarkedCycling = L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Map style: &copy; <a href="https://waymarkedtrails.org">waymarkedtrails.org</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    });

    // Add default base layer
    osmStandard.addTo(map);

    // ── Compass Control ──────────────────────────────────────
    const CompassControl = L.Control.extend({
      options: { position: 'topleft' },

      onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-compass-control');
        container.innerHTML = `
          <div class="compass-rose">
            <svg class="compass-svg" viewBox="0 0 80 80" width="72" height="72">
              <circle cx="40" cy="40" r="37" fill="none" stroke="var(--border)" stroke-width="1.5"/>
              <line x1="40" y1="4"  x2="40" y2="12" stroke="var(--text-secondary)" stroke-width="1.5"/>
              <line x1="40" y1="68" x2="40" y2="76" stroke="var(--text-secondary)" stroke-width="1.5"/>
              <line x1="4"  y1="40" x2="12" y2="40" stroke="var(--text-secondary)" stroke-width="1.5"/>
              <line x1="68" y1="40" x2="76" y2="40" stroke="var(--text-secondary)" stroke-width="1.5"/>
              <line x1="14.1" y1="14.1" x2="19.8" y2="19.8" stroke="var(--border)" stroke-width="1"/>
              <line x1="60.2" y1="60.2" x2="65.9" y2="65.9" stroke="var(--border)" stroke-width="1"/>
              <line x1="65.9" y1="14.1" x2="60.2" y2="19.8" stroke="var(--border)" stroke-width="1"/>
              <line x1="19.8" y1="60.2" x2="14.1" y2="65.9" stroke="var(--border)" stroke-width="1"/>
              <text x="40" y="10"  text-anchor="middle" class="compass-label" fill="var(--danger)">N</text>
              <text x="40" y="74"  text-anchor="middle" class="compass-label" fill="var(--text-secondary)">S</text>
              <text x="76" y="44"  text-anchor="middle" class="compass-label" fill="var(--text-secondary)">E</text>
              <text x="4"  y="44"  text-anchor="middle" class="compass-label" fill="var(--text-secondary)">W</text>
              <g class="compass-needle-group">
                <polygon points="40,10 36,40 40,36 44,40" fill="var(--danger)" opacity="0.95"/>
                <polygon points="40,70 36,40 40,44 44,40" fill="var(--text-secondary)" opacity="0.5"/>
                <circle cx="40" cy="40" r="3.5" fill="var(--bg-secondary)" stroke="var(--border)" stroke-width="1"/>
              </g>
            </svg>
          </div>
          <div class="compass-readout">
            <span class="compass-deg">—°</span>
            <span class="compass-dir">—</span>
          </div>
        `;
        L.DomEvent.disableClickPropagation(container);
        return container;
      },
    });

    compassControl = new CompassControl();
    compassControl.addTo(map);

    // ── Layer Control ────────────────────────────────────────
    const baseLayers = {
      '🗺 OpenStreetMap':   osmStandard,
      '🏔 OpenTopoMap':     openTopoMap,
      '🥾 Stadia Outdoors': stadiaOutdoors,
      '🛰 Satellite':       stadiaSatellite,
    };

    const overlayLayers = {
      '🥾 Hiking Trails':  waymarkedHiking,
      '🚴 Cycling Routes': waymarkedCycling,
    };

    layerControl = L.control.layers(baseLayers, overlayLayers, { position: 'topright', collapsed: true }).addTo(map);

    // Add overlay layers for any activities already in storage
    loadActivityLayers();

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);

    // Animated crosshair marker
    const icon = L.divIcon({
      className: 'crosshair-icon',
      html: `<svg class="crosshair-svg" width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="7" fill="none" stroke="#39d353" stroke-width="2.5"/>
        <circle cx="20" cy="20" r="2.5" fill="#39d353"/>
        <line x1="20" y1="2"  x2="20" y2="11" stroke="#39d353" stroke-width="2" stroke-linecap="round"/>
        <line x1="20" y1="29" x2="20" y2="38" stroke="#39d353" stroke-width="2" stroke-linecap="round"/>
        <line x1="2"  y1="20" x2="11" y2="20" stroke="#39d353" stroke-width="2" stroke-linecap="round"/>
        <line x1="29" y1="20" x2="38" y2="20" stroke="#39d353" stroke-width="2" stroke-linecap="round"/>
      </svg>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    crosshairMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 }).addTo(map);

    accuracyCircle = L.circle([lat, lon], {
      radius: 20,
      color: '#39d353',
      fillColor: '#39d353',
      fillOpacity: 0.08,
      weight: 1,
      opacity: 0.4,
    }).addTo(map);

    trackLine = L.polyline([], {
      color: '#39d353',
      weight: 4,
      opacity: 0.85,
      smoothFactor: 3,
      lineJoin: 'round',
      lineCap: 'round',
    }).addTo(map);

    map.on('zoomend', () => { $('val-zoom').textContent = map.getZoom(); });
    $('val-zoom').textContent = map.getZoom();

    // Detect user-initiated pan or zoom; show Re-center button
    let _recentering = false;  // true while we are programmatically re-centering
    function onUserMove() {
      if (_recentering) return;
      userPanned = true;
      $('recenter-btn').classList.add('visible');
    }
    map.on('dragstart', onUserMove);
    map.on('zoomstart', onUserMove);

    // Clear _recentering flag once the programmatic pan/zoom has settled
    map.on('moveend', () => { _recentering = false; });

    // Re-center button — snap back to current GPS location and resume following
    $('recenter-btn').addEventListener('click', () => {
      if (!lastPos) return;
      _recentering = true;
      userPanned   = false;
      $('recenter-btn').classList.remove('visible');
      map.setView([lastPos.lat, lastPos.lon], map.getZoom(), { animate: true });
    });

    mapInitialized = true;
  }

  // ── GPS ───────────────────────────────────────────────────
  function startGPS() {
    const isFileProtocol = location.protocol === 'file:';

    if (!navigator.geolocation || isFileProtocol) {
      $('gps-status').textContent = isFileProtocol ? 'MOCK GPS' : 'NO GPS';
      if (isFileProtocol) startMockGPS();
      return;
    }

    // Use watchPosition for real GPS devices (mobile).
    // On desktop Chrome, watchPosition only fires once (no GPS hardware),
    // so we also poll with getCurrentPosition every second as a fallback.
    watchId = navigator.geolocation.watchPosition(
      onPosition,
      onGPSError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    // Polling fallback — fires getCurrentPosition every 1 s.
    // onPosition deduplicates by timestamp, so double-fires are harmless.
    let lastPostedTs = 0;
    const _wrappedOnPosition = (pos) => {
      if (pos.timestamp !== lastPostedTs) {
        lastPostedTs = pos.timestamp;
        onPosition(pos);
      }
    };
    const pollId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        _wrappedOnPosition,
        () => {},   // ignore poll errors silently
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    }, 1000);

    // Store pollId so we can cancel it if needed
    window._gpsPollId = pollId;
  }

  // ── Mock GPS (file:// testing only) ──────────────────────
  // Simulates a walk around a city block near Toronto starting point
  function startMockGPS() {
    const MOCK_START = { lat: 43.6532, lon: -79.3832 };
    const STEP = 0.00008;   // ~8 m per tick
    let mockLat = MOCK_START.lat;
    let mockLon = MOCK_START.lon;
    let mockAngle = 0;      // degrees, changes to simulate turns
    let mockTick = 0;

    function mockFix() {
      // Walk in a rough square: N → E → S → W
      const segment = Math.floor(mockTick / 30) % 4;
      const angles  = [0, 90, 180, 270];
      mockAngle = angles[segment];

      const rad = mockAngle * Math.PI / 180;
      mockLat += Math.cos(rad) * STEP;
      mockLon += Math.sin(rad) * STEP;
      mockTick++;

      const mockPos = {
        coords: {
          latitude:  mockLat,
          longitude: mockLon,
          altitude:  null,
          accuracy:  12,
          speed:     1.4,          // ~5 km/h
          heading:   mockAngle,
        },
        timestamp: Date.now(),
      };
      onPosition(mockPos);
    }

    // Fire an immediate fix, then every 2 s
    mockFix();
    watchId = setInterval(mockFix, 2000);
    console.log('[TRACKER] Mock GPS started (file:// mode)');
  }

  function onPosition(pos) {
    const { latitude: lat, longitude: lon, altitude: alt,
            accuracy: acc, speed, heading } = pos.coords;
    const ts = pos.timestamp;

    // Update GPS pill
    $('gps-pill').classList.add('active');
    $('gps-status').textContent = 'GPS LOCK';

    // First fix — initialise map
    if (!mapInitialized) initMap(lat, lon);

    // Always track the latest position for re-centering
    lastPos = { lat, lon };

    // Move marker & accuracy ring
    crosshairMarker.setLatLng([lat, lon]);
    accuracyCircle.setLatLng([lat, lon]).setRadius(acc || 10);

    // Auto-follow unless the user has manually panned away
    if (!userPanned) {
      map.setView([lat, lon]);
    }

    // Update info dashboard
    updateInfoPanel({ lat, lon, alt, acc, speed, heading });

    // Update compass rose
    updateCompass(heading);

    // Record data point when active
    if (isRecording && !isPaused) {
      if (lastGoodPos && acc < settings.accFilter) {
        const d = haversine(lastGoodPos.lat, lastGoodPos.lon, lat, lon);
        if (d > settings.jitterFilter) {
          totalDistance += d;
          $('val-dist').textContent = totalDistance.toFixed(2) + ' km';
        }
      }
      if (acc < settings.accFilter) lastGoodPos = { lat, lon };

      // Throttle: only record a point if enough time has elapsed
      if (ts - lastRecordedTs >= settings.pointInterval) {
        lastRecordedTs = ts;

        // Compact format: short keys + reduced precision + omit nulls
        // saves ~70% storage vs full JSON  (lat/lon 5dp ≈ 1m accuracy)
        const pt = {
          a: parseFloat(lat.toFixed(5)),
          o: parseFloat(lon.toFixed(5)),
          t: ts,
        };
        if (alt   != null) pt.l = Math.round(alt);
        if (acc   != null) pt.c = parseFloat(acc.toFixed(1));
        if (speed != null) pt.s = parseFloat((speed * 3.6).toFixed(1)); // store as km/h
        if (heading != null) pt.h = Math.round(heading);

        currentPoints.push(pt);
      }

      if (settings.smoothLines) {
        // Smooth track using Exponential Moving Average
        if (smoothedPoints.length === 0) {
          smoothedPoints.push([lat, lon]);
        } else {
          const alpha = 0.35;
          const prev  = smoothedPoints[smoothedPoints.length - 1];
          smoothedPoints.push([
            prev[0] + alpha * (lat - prev[0]),
            prev[1] + alpha * (lon - prev[1]),
          ]);
        }
        trackLine.setLatLngs(smoothedPoints);
      } else {
        // Raw mode — plot every accepted point directly
        if (acc < settings.accFilter) {
          const d = lastGoodPos
            ? haversine(lastGoodPos.lat, lastGoodPos.lon, lat, lon)
            : Infinity;
          if (d > settings.jitterFilter) {
            smoothedPoints.push([lat, lon]);
            trackLine.setLatLngs(smoothedPoints);
          }
        }
      }
    }
  }

  function onGPSError(err) {
    $('gps-status').textContent = 'GPS ERROR';
    console.warn('GPS error', err);
  }

  // ── Utilities ─────────────────────────────────────────────
  function haversine(lat1, lon1, lat2, lon2) {
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) *
              Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function headingLabel(h) {
    if (h == null) return '—';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return Math.round(h) + '° ' + dirs[Math.round(h / 45) % 8];
  }

  function updateCompass(gpsHeading) {
    if (!compassControl) return;
    const container = compassControl.getContainer();
    if (!container) return;
    const needleGroup = container.querySelector('.compass-needle-group');
    const degEl       = container.querySelector('.compass-deg');
    const dirEl       = container.querySelector('.compass-dir');
    // GPS heading takes priority when moving; fall back to device compass
    const heading = gpsHeading != null ? gpsHeading : deviceHeading;
    if (heading == null) {
      degEl.textContent = '—°';
      dirEl.textContent = '—';
      return;
    }
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const dir  = dirs[Math.round(heading / 22.5) % 16];
    degEl.textContent = Math.round(heading) + '°';
    dirEl.textContent = dir;
    if (needleGroup) {
      needleGroup.style.transformOrigin = '40px 40px';
      needleGroup.style.transform       = `rotate(${heading}deg)`;
    }
  }

  function fmtDuration(ms) {
    const s   = Math.floor(ms / 1000);
    const m   = Math.floor(s / 60);
    const sec = s % 60;
    const h   = Math.floor(m / 60);
    const min = m % 60;
    return h
      ? `${h}h${String(min).padStart(2, '0')}m`
      : `${min}m${String(sec).padStart(2, '0')}s`;
  }

  function escHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Info Dashboard ────────────────────────────────────────
  function updateInfoPanel({ lat, lon, alt, acc, speed, heading }) {
    const now = new Date();
    // Use GPS heading when moving, fall back to device compass when stationary
    const displayHeading = heading != null ? heading : deviceHeading;
    $('val-date').textContent    = now.toLocaleDateString('en-CA').replace(/-/g, '/');
    $('val-lat').textContent     = lat   != null ? lat.toFixed(6)           : '—';
    $('val-lon').textContent     = lon   != null ? lon.toFixed(6)           : '—';
    $('val-speed').textContent   = speed != null ? (speed * 3.6).toFixed(1) + ' km/h' : '0.0 km/h';
    $('val-acc').textContent     = acc   != null ? acc.toFixed(2) + ' m'   : '—';
    $('val-alt').textContent     = alt   != null ? Math.round(alt) + ' m'  : '—';
    $('val-heading').textContent = headingLabel(displayHeading);
  }

  // ── Live Clock ────────────────────────────────────────────
  function startClock() {
    const tick = () => {
      $('val-time').textContent = new Date().toTimeString().slice(0, 8);
    };
    tick();
    clockInterval = setInterval(tick, 1000);
  }

  // ── Recording Controls ────────────────────────────────────

  // Helpers to switch the Start/Pause toggle button appearance
  function setStartMode() {
    const btn = $('btn-start');
    btn.querySelector('.icon-play').style.display  = '';
    btn.querySelector('.icon-pause').style.display = 'none';
    btn.querySelector('.btn-start-label').textContent = 'Start';
    btn.classList.remove('pause');
    btn.classList.add('start');
  }

  function setPauseMode() {
    const btn = $('btn-start');
    btn.querySelector('.icon-play').style.display  = 'none';
    btn.querySelector('.icon-pause').style.display = '';
    btn.querySelector('.btn-start-label').textContent = 'Pause';
    btn.classList.remove('start');
    btn.classList.add('pause');
  }

  // Start button — also acts as Pause toggle once recording is active
  $('btn-start').addEventListener('click', () => {
    if (!isRecording) {
      // ── START ──────────────────────────────────────────────
      isRecording    = true;
      isPaused       = false;
      currentPoints  = [];
      smoothedPoints = [];
      totalDistance  = 0;
      lastGoodPos    = null;
      lastRecordedTs = 0;
      recStartTime   = Date.now();

      if (trackLine) trackLine.setLatLngs([]);
      $('val-dist').textContent = '0.00 km';
      $('btn-stop').disabled    = false;
      $('rec-indicator').classList.add('show');
      $('rec-label').textContent = 'REC';
      setPauseMode();
    } else {
      // ── PAUSE / RESUME toggle ──────────────────────────────
      isPaused = !isPaused;
      if (isPaused) {
        setStartMode();   // button shows "Start" (resume)
        $('rec-label').textContent = 'PAUSED';
      } else {
        setPauseMode();   // button shows "Pause"
        $('rec-label').textContent = 'REC';
      }
    }
  });

  $('btn-stop').addEventListener('click', () => {
    if (!isRecording) return;
    isRecording = false;
    isPaused    = false;
    $('btn-stop').disabled = true;
    $('rec-indicator').classList.remove('show');
    setStartMode();
    openNameModal();
  });

  // ── Name Modal ────────────────────────────────────────────
  function openNameModal() {
    $('activity-name-input').value = 'Hike ' + new Date().toLocaleDateString('en-CA');
    // Show a summary so the user can confirm data was captured
    const pts = currentPoints.length;
    const dist = totalDistance.toFixed(2);
    $('name-modal-summary').textContent =
      pts + ' point' + (pts !== 1 ? 's' : '') + ' · ' + dist + ' km';
    $('name-modal').classList.add('open');
    setTimeout(() => $('activity-name-input').focus(), 100);
  }

  // ── Activity Path Layers ─────────────────────────────────

  // Cycle through these colours so multiple activities are visually distinct
  const LAYER_COLOURS = [
    '#58a6ff', '#f78166', '#d2a8ff', '#ffa657',
    '#79c0ff', '#ff7b72', '#a5d6ff', '#56d364',
  ];

  function pointsToLatLngs(points) {
    return points
      .map(p => {
        const lat = p.a ?? p.lat;
        const lon = p.o ?? p.lon;
        return (lat != null && lon != null) ? [lat, lon] : null;
      })
      .filter(Boolean);
  }

  function loadActivityLayers() {
    if (!layerControl) return;
    const activities = JSON.parse(storage.get('tracker_activities') || '[]');
    activities.forEach((a, idx) => addActivityLayer(a, idx));
  }

  function addActivityLayer(activity, colourIndex) {
    if (!layerControl || !map) return;
    if (activityLayers[activity.id]) return;   // already added

    const latlngs = pointsToLatLngs(activity.points || []);
    if (latlngs.length < 2) return;

    const colour = LAYER_COLOURS[colourIndex % LAYER_COLOURS.length];
    const line = L.polyline(latlngs, {
      color:        colour,
      weight:       3,
      opacity:      0.75,
      smoothFactor: 2,
      lineJoin:     'round',
      lineCap:      'round',
    });

    // Truncate long names so the layer control stays tidy
    const label = activity.name.length > 22
      ? activity.name.slice(0, 20) + '…'
      : activity.name;

    layerControl.addOverlay(line, `📍 ${label}`);
    activityLayers[activity.id] = line;
  }

  function removeActivityLayer(id) {
    const line = activityLayers[id];
    if (!line) return;
    if (map.hasLayer(line)) map.removeLayer(line);
    layerControl.removeLayer(line);
    delete activityLayers[id];
  }

  function saveActivity() {
    const name = $('activity-name-input').value.trim() || 'Unnamed Activity';

    // Snapshot points array by value so later resets don't affect the saved record
    const record = {
      id:       String(Date.now()),
      name,
      date:     new Date().toLocaleDateString('en-CA').replace(/-/g, '/'),
      duration: recStartTime ? Date.now() - recStartTime : 0,
      distance: totalDistance,
      points:   currentPoints.slice(),   // <-- snapshot, not reference
    };

    try {
      const activities = JSON.parse(storage.get('tracker_activities') || '[]');
      activities.unshift(record);
      storage.set('tracker_activities', JSON.stringify(activities));
      // Add the saved path as an overlay layer on the map
      addActivityLayer(record, activities.length - 1);
    } catch (err) {
      // Storage quota exceeded — try saving without older activities
      console.warn('localStorage full, saving only latest activity:', err);
      try {
        storage.set('tracker_activities', JSON.stringify([record]));
      } catch (err2) {
        console.error('Could not save activity:', err2);
        alert('Could not save activity — storage is full.');
        return;
      }
    }

    $('name-modal').classList.remove('open');
    if (trackLine) trackLine.setLatLngs([]);
  }

  $('name-modal-close').addEventListener('click', () => $('name-modal').classList.remove('open'));
  $('name-discard').addEventListener('click', () => {
    if (trackLine) trackLine.setLatLngs([]);
    $('name-modal').classList.remove('open');
  });
  $('name-save').addEventListener('click', saveActivity);
  $('activity-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveActivity();
  });

  // ── History Modal ─────────────────────────────────────────
  function openHistory() {
    $('history-modal').classList.add('open');
    renderHistoryList();
  }

  function renderHistoryList() {
    const activities = JSON.parse(storage.get('tracker_activities') || '[]');
    const list = $('history-list');

    if (activities.length === 0) {
      list.innerHTML = '<div class="history-empty">No activities yet</div>';
      $('history-detail').innerHTML = '<div class="detail-empty">Select an activity</div>';
      return;
    }

    list.innerHTML = activities.map(a => `
      <div class="history-item" data-id="${a.id}">
        <div class="history-item-body">
          <div class="history-item-name">${escHtml(a.name)}</div>
          <div class="history-item-meta">${a.date} · ${a.distance.toFixed(2)}km · ${fmtDuration(a.duration)}</div>
        </div>
        <button class="history-delete-btn" data-id="${a.id}" aria-label="Delete activity">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `).join('');

    list.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', (e) => {
        // Don't select if the delete button was clicked
        if (e.target.closest('.history-delete-btn')) return;
        list.querySelectorAll('.history-item').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
        showActivityDetail(el.dataset.id, activities);
      });
    });

    list.querySelectorAll('.history-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteActivity(btn.dataset.id);
      });
    });
  }

  function deleteActivity(id) {
    let activities = JSON.parse(storage.get('tracker_activities') || '[]');
    activities = activities.filter(a => String(a.id) !== String(id));
    storage.set('tracker_activities', JSON.stringify(activities));
    removeActivityLayer(id);

    // If the deleted activity was selected, clear the detail pane
    const detail = $('history-detail');
    const selectedEl = $('history-list').querySelector('.history-item.selected');
    if (selectedEl && selectedEl.dataset.id === String(id)) {
      detail.innerHTML = '<div class="detail-empty">Select an activity</div>';
    }

    renderHistoryList();
  }

  function showActivityDetail(id, activities) {
    const a      = activities.find(x => String(x.id) === String(id));
    const detail = $('history-detail');
    if (!a) return;

    if (!a.points || a.points.length === 0) {
      detail.innerHTML = '<div class="detail-empty">No data points</div>';
      return;
    }

    detail.innerHTML = a.points.map((p, i) => {
      // Support both compact keys (a/o/t/l/c/s/h) and legacy full keys
      const lat   = p.a   ?? p.lat;
      const lon   = p.o   ?? p.lon;
      const ts    = p.t   ?? p.ts;
      const alt   = p.l   ?? p.alt;
      const acc   = p.c   ?? p.acc;
      // compact speed is already km/h; legacy speed is m/s
      const spd   = p.s   != null ? p.s
                  : p.speed != null ? parseFloat((p.speed * 3.6).toFixed(1))
                  : null;
      const hdg   = p.h   ?? p.heading;
      return `
      <div class="detail-point">
        <span class="dp-idx">#${String(i + 1).padStart(3, '0')}</span>
        &nbsp;${new Date(ts).toTimeString().slice(0, 8)}<br>
        LAT ${lat != null ? lat.toFixed(5) : '—'} &nbsp;
        LON ${lon != null ? lon.toFixed(5) : '—'}<br>
        ALT ${alt != null ? alt + 'm'      : '—'} &nbsp;
        ACC ${acc != null ? acc + 'm'      : '—'} &nbsp;
        SPD ${spd != null ? spd + 'km/h'   : '—'}
      </div>`;
    }).join('');
  }

  $('btn-history').addEventListener('click', openHistory);
  $('history-modal-close').addEventListener('click', () => $('history-modal').classList.remove('open'));

  // ── Theme Toggle ──────────────────────────────────────────
  $('theme-toggle').addEventListener('click', () => {
    isDark = !isDark;
    document.documentElement.classList.toggle('light', !isDark);
    $('app').classList.toggle('light', !isDark);

    const icon = isDark ? SVG_SUN : SVG_MOON;
    const label = isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme';
    $('theme-toggle').innerHTML = icon + ' ' + label;

    closeMenu();
  });

  // ── Hamburger Menu ────────────────────────────────────────
  function closeMenu() { $('dropdown').classList.remove('open'); }

  $('menu-btn').addEventListener('click', e => {
    e.stopPropagation();
    $('dropdown').classList.toggle('open');
  });

  document.addEventListener('click', closeMenu);
  $('dropdown').addEventListener('click', e => e.stopPropagation());

  // ── Settings Modal ───────────────────────────────────────

  // Sync all UI controls to match the current settings object
  function applySettingsToUI() {
    const jitterMetres = Math.round(settings.jitterFilter * 1000);
    $('setting-smooth').checked              = settings.smoothLines;
    $('setting-jitter').value                = jitterMetres;
    $('jitter-value-label').textContent      = jitterMetres + ' m';
    $('setting-point-interval').value        = String(settings.pointInterval);
    $('setting-gps-interval').value          = String(settings.gpsInterval);
    $('setting-acc-filter').value            = String(settings.accFilter);
    $('jitter-row').classList.toggle('disabled', !settings.smoothLines);
  }

  $('settings-btn').addEventListener('click', () => {
    applySettingsToUI();   // always reflect current values when opening
    $('settings-modal').classList.add('open');
    closeMenu();
  });
  $('settings-modal-close').addEventListener('click', () => $('settings-modal').classList.remove('open'));
  $('settings-modal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });

  // Smooth toggle
  $('setting-smooth').addEventListener('change', function() {
    settings.smoothLines = this.checked;
    $('jitter-row').classList.toggle('disabled', !this.checked);
    saveSettings();
  });

  // Jitter slider
  $('setting-jitter').addEventListener('input', function() {
    const metres = parseInt(this.value, 10);
    settings.jitterFilter = metres / 1000;
    $('jitter-value-label').textContent = metres + ' m';
    saveSettings();
  });

  // Point record interval
  $('setting-point-interval').addEventListener('change', function() {
    settings.pointInterval = parseInt(this.value, 10);
    saveSettings();
  });

  // GPS interval select — restart watch to apply
  $('setting-gps-interval').addEventListener('change', function() {
    settings.gpsInterval = parseInt(this.value, 10);
    saveSettings();
    if (watchId != null) {
      if (location.protocol === 'file:') {
        clearInterval(watchId);
      } else {
        navigator.geolocation.clearWatch(watchId);
      }
      watchId = null;
      startGPS();
    }
  });

  // Accuracy filter select
  $('setting-acc-filter').addEventListener('change', function() {
    settings.accFilter = parseInt(this.value, 10);
    saveSettings();
  });

  // ── About Modal ───────────────────────────────────────────
  $('about-btn').addEventListener('click', () => {
    $('about-modal').classList.add('open');
    closeMenu();
  });
  $('about-modal-close').addEventListener('click', () => $('about-modal').classList.remove('open'));

  // ── Close Modals on Backdrop Click ────────────────────────
  ['name-modal', 'history-modal', 'about-modal'].forEach(id => {
    $(id).addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('open');
    });
  });

  // ── Device Orientation (compass fallback for heading) ────
  function startCompass() {
    // iOS 13+ requires a permission request for DeviceOrientationEvent
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      // On iOS we can only request on a user gesture; attach a one-time
      // listener to the first tap anywhere on the page
      document.addEventListener('click', function reqPermission() {
        DeviceOrientationEvent.requestPermission()
          .then(state => { if (state === 'granted') listenOrientation(); })
          .catch(() => {});
        document.removeEventListener('click', reqPermission);
      }, { once: true });
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      // Android and desktop — no permission needed
      listenOrientation();
    }
  }

  function listenOrientation() {
    window.addEventListener('deviceorientationabsolute', onOrientation, true);
    // Fallback for browsers that only fire 'deviceorientation'
    window.addEventListener('deviceorientation', onOrientation, true);
  }

  function onOrientation(e) {
    // `webkitCompassHeading` (iOS) is degrees clockwise from true north
    // `alpha` (Android absolute) needs to be converted: heading = 360 - alpha
    let heading = null;
    if (e.webkitCompassHeading != null) {
      heading = e.webkitCompassHeading;
    } else if (e.absolute && e.alpha != null) {
      heading = (360 - e.alpha) % 360;
    } else if (e.alpha != null) {
      // Non-absolute alpha — less reliable but better than nothing
      heading = (360 - e.alpha) % 360;
    }
    if (heading == null) return;
    deviceHeading = heading;
    // Only push compass heading to the UI when GPS isn't providing one
    // (updateCompass is called each GPS fix; here we refresh between fixes)
    updateCompass(null);
    // Also update the heading card directly so it stays live
    const displayHeading = deviceHeading;
    $('val-heading').textContent = headingLabel(displayHeading);
  }

  // ── Boot ──────────────────────────────────────────────────
  startClock();
  startGPS();
  startCompass();

  // Fallback map centre if GPS takes longer than 4 s
  setTimeout(() => {
    if (!mapInitialized) initMap(43.6532, -79.3832);
  }, 4000);

})();
