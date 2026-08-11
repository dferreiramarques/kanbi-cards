// Kanbi Cards — offline shell cache
// Bump CACHE_NAME on every deploy so old assets get evicted.
const CACHE_NAME = 'kanbi-cards-v1';
const ASSETS = [
  './',
  './kanbi.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (new URL(e.request.url).origin !== self.location.origin) return;
  if (e.request.method !== 'GET') return;

  // Network-first for the app shell so users get fixes/bug patches without
  // waiting for the cache to expire; fall back to cache when offline.
  const isShell = e.request.mode === 'navigate' || e.request.url.endsWith('/kanbi.html');
  if (isShell) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((cached) => cached || caches.match('./kanbi.html')))
    );
    return;
  }

  // Cache-first for static assets (icons, manifest).
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
