self.addEventListener('install', (e) = {
  e.waitUntil(
    caches.open('hk-stock-store').then((cache) = cache.addAll([
      '.index.html',
      '.manifest.json',
       '.icon.png'  Uncomment this if you have an icon
    ]))
  );
});

self.addEventListener('fetch', (e) = {
  e.respondWith(
    caches.match(e.request).then((response) = response  fetch(e.request))
  );
});