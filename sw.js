/* Taghvim service worker — network-first, versioned, self-healing.
   Online: always serves the freshest files (no more "stuck on old broken version").
   Offline: falls back to the last successful cache. */
const CACHE = 'taghvim-v5';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Cache only the tiny app shell up front. Hashed bundles are cached on first use.
      await Promise.allSettled(
        ['./', './index.html', './manifest.webmanifest', './icon.svg'].map((url) => cache.add(url))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
