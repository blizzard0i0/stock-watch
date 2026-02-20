// NOTE:
// - Keep the "?v=" version on JS so users can hard-bust when needed.
// - For stability, ONLY precache app-shell files (HTML/CSS/JS/manifest/icons).
// - Runtime cache is limited to images/fonts only (no HTML/CSS/JS runtime caching),
//   to avoid "old JS served" issues after upgrades.

const CACHE_NAME = 'hk-stock-store-v24';
const ASSET_CACHE_NAME = 'hk-stock-assets-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './styles.css',
  './main.js',
  './hsi_constituents.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => (
          key !== CACHE_NAME && key !== ASSET_CACHE_NAME ? caches.delete(key) : null
        ))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);

  // Do NOT cache cross-origin API responses. iOS/Safari may otherwise serve stale data.
  if (requestUrl.origin !== self.location.origin) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // App shell navigation: always serve cached index.html when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  const dest = event.request.destination;
  const isAsset = dest === 'image' || dest === 'font';

  if (isAsset) {
    // Stale-while-revalidate for images/fonts
    event.respondWith(
      caches.open(ASSET_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response && response.ok) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => null);
        return cached || (await fetchPromise) || cached;
      })
    );
    return;
  }

  // For same-origin non-asset GET requests (HTML/CSS/JS/JSON), use cache-first
  // but DO NOT runtime-cache new responses.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});