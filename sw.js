const CACHE_NAME = 'ewb-cache-v5';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/main.js',
  '/EWBclient.js',
  '/manifest.json',
  '/icons/PWB32icon-192x192.png',
  '/icons/PWB32icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // Network-first, falling back to cache strategy
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
