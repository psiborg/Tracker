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
  let lastGoodPos   = null;
  let watchId       = null;
  let clockInterval = null;
  let recStartTime  = null;

  // ── Map Objects ───────────────────────────────────────────
  let map, crosshairMarker, trackLine, accuracyCircle;
  let mapInitialized = false;

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

    L.control.layers(baseLayers, overlayLayers, { position: 'topright', collapsed: true }).addTo(map);

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

    mapInitialized = true;
  }

  // ── GPS ───────────────────────────────────────────────────
  function startGPS() {
    if (!navigator.geolocation) {
      $('gps-status').textContent = 'NO GPS';
      return;
    }
    watchId = navigator.geolocation.watchPosition(
      onPosition,
      onGPSError,
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
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

    // Move marker & accuracy ring
    crosshairMarker.setLatLng([lat, lon]);
    accuracyCircle.setLatLng([lat, lon]).setRadius(acc || 10);
    map.setView([lat, lon]);

    // Update info dashboard
    updateInfoPanel({ lat, lon, alt, acc, speed, heading });

    // Record data point when active
    if (isRecording && !isPaused) {
      if (lastGoodPos && acc < 50) {
        const d = haversine(lastGoodPos.lat, lastGoodPos.lon, lat, lon);
        if (d > 0.003) {                          // ignore jitter < 3 m
          totalDistance += d;
          $('val-dist').textContent = totalDistance.toFixed(2) + ' km';
        }
      }
      if (acc < 50) lastGoodPos = { lat, lon };

      currentPoints.push({ lat, lon, alt, acc, speed, heading, ts });

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
    $('val-date').textContent    = now.toLocaleDateString('en-CA').replace(/-/g, '/');
    $('val-lat').textContent     = lat   != null ? lat.toFixed(6)           : '—';
    $('val-lon').textContent     = lon   != null ? lon.toFixed(6)           : '—';
    $('val-speed').textContent   = speed != null ? (speed * 3.6).toFixed(1) + ' km/h' : '0.0 km/h';
    $('val-acc').textContent     = acc   != null ? acc.toFixed(2) + ' m'   : '—';
    $('val-alt').textContent     = alt   != null ? Math.round(alt) + ' m'  : '—';
    $('val-heading').textContent = headingLabel(heading);
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
  $('btn-start').addEventListener('click', () => {
    if (isRecording) return;
    isRecording    = true;
    isPaused       = false;
    currentPoints  = [];
    smoothedPoints = [];
    totalDistance  = 0;
    lastGoodPos    = null;
    recStartTime   = Date.now();

    if (trackLine) trackLine.setLatLngs([]);
    $('val-dist').textContent   = '0.00 km';
    $('btn-start').disabled     = true;
    $('btn-pause').disabled     = false;
    $('btn-stop').disabled      = false;
    $('rec-indicator').classList.add('show');
    $('rec-label').textContent  = 'REC';
  });

  $('btn-pause').addEventListener('click', () => {
    if (!isRecording) return;
    isPaused = !isPaused;
    $('btn-pause').classList.toggle('active-btn', isPaused);
    $('rec-label').textContent = isPaused ? 'PAUSED' : 'REC';
  });

  $('btn-stop').addEventListener('click', () => {
    if (!isRecording) return;
    isRecording = false;
    isPaused    = false;
    $('btn-start').disabled = false;
    $('btn-pause').disabled = true;
    $('btn-stop').disabled  = true;
    $('btn-pause').classList.remove('active-btn');
    $('rec-indicator').classList.remove('show');
    openNameModal();
  });

  // ── Name Modal ────────────────────────────────────────────
  function openNameModal() {
    $('activity-name-input').value = 'Hike ' + new Date().toLocaleDateString('en-CA');
    $('name-modal').classList.add('open');
    setTimeout(() => $('activity-name-input').focus(), 100);
  }

  function saveActivity() {
    const name = $('activity-name-input').value.trim() || 'Unnamed Activity';
    const record = {
      id:       Date.now(),
      name,
      date:     new Date().toLocaleDateString('en-CA').replace(/-/g, '/'),
      duration: Date.now() - recStartTime,
      distance: totalDistance,
      points:   currentPoints,
    };
    const activities = JSON.parse(localStorage.getItem('tracker_activities') || '[]');
    activities.unshift(record);
    localStorage.setItem('tracker_activities', JSON.stringify(activities));
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
    const activities = JSON.parse(localStorage.getItem('tracker_activities') || '[]');
    const list = $('history-list');

    if (activities.length === 0) {
      list.innerHTML = '<div class="history-empty">No activities yet</div>';
      return;
    }

    list.innerHTML = activities.map(a => `
      <div class="history-item" data-id="${a.id}">
        <div class="history-item-name">${escHtml(a.name)}</div>
        <div class="history-item-meta">${a.date} · ${a.distance.toFixed(2)}km · ${fmtDuration(a.duration)}</div>
      </div>
    `).join('');

    list.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => {
        list.querySelectorAll('.history-item').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
        showActivityDetail(parseInt(el.dataset.id, 10), activities);
      });
    });
  }

  function showActivityDetail(id, activities) {
    const a      = activities.find(x => x.id === id);
    const detail = $('history-detail');
    if (!a) return;

    if (!a.points || a.points.length === 0) {
      detail.innerHTML = '<div class="detail-empty">No data points</div>';
      return;
    }

    detail.innerHTML = a.points.map((p, i) => `
      <div class="detail-point">
        <span class="dp-idx">#${String(i + 1).padStart(3, '0')}</span>
        &nbsp;${new Date(p.ts).toTimeString().slice(0, 8)}<br>
        LAT ${p.lat  != null ? p.lat.toFixed(6)          : '—'} &nbsp;
        LON ${p.lon  != null ? p.lon.toFixed(6)          : '—'}<br>
        ALT ${p.alt  != null ? Math.round(p.alt) + 'm'  : '—'} &nbsp;
        ACC ${p.acc  != null ? p.acc.toFixed(1) + 'm'   : '—'} &nbsp;
        SPD ${p.speed!= null ? (p.speed * 3.6).toFixed(1) + 'km/h' : '—'}
      </div>
    `).join('');
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

  // ── Boot ──────────────────────────────────────────────────
  startClock();
  startGPS();

  // Fallback map centre if GPS takes longer than 4 s
  setTimeout(() => {
    if (!mapInitialized) initMap(43.6532, -79.3832);
  }, 4000);

})();
