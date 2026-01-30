const CACHE_NAME = 'hk-stock-store-v15';
const DATA_CACHE_NAME = 'hk-stock-data-v1';
const PRECACHE_URLS = ['./', './index.html', './manifest.json', './icon.png', './styles.css', './main.js?v=18'];

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
          key !== CACHE_NAME && key !== DATA_CACHE_NAME ? caches.delete(key) : null
        ))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    // Do NOT cache cross-origin API responses. iOS/Safari may otherwise serve stale data.
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => (event.request.mode === 'navigate' ? caches.match('./index.html') : cached));
    })
  );
});