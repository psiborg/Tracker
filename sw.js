const CACHE_NAME = 'tracker-v2';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.json',
  './lib/leaflet.min.css',
  './lib/leaflet.min.js',
  './lib/fonts.css',
  './lib/images/layers.png',
  './lib/images/layers-2x.png',
  './lib/images/marker-icon.png',
  './lib/images/marker-icon-2x.png',
  './lib/images/marker-shadow.png',
  './fonts/rajdhani-latin-400-normal.woff2',
  './fonts/rajdhani-latin-500-normal.woff2',
  './fonts/rajdhani-latin-600-normal.woff2',
  './fonts/rajdhani-latin-700-normal.woff2',
  './fonts/share-tech-mono-latin-400-normal.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Cache map tiles as they are fetched (network-first, fall back to cache)
  if (e.request.url.includes('tile.openstreetmap.org') ||
      e.request.url.includes('tile.opentopomap.org') ||
      e.request.url.includes('stadiamaps.com') ||
      e.request.url.includes('waymarkedtrails.org')) {
    e.respondWith(
      caches.open('tracker-tiles').then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // All other assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});
