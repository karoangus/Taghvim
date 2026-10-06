/* Taghvim service worker — versioned, self-healing, offline-first where it is safe.
   - Hashed build assets (/assets/*) are immutable → cache-first (instant repeat loads).
   - Everything else (HTML, manifest, icon) → network-first, so a new deploy is picked up
     immediately and the app can never get "stuck on an old broken version".
   - Offline → falls back to the last successful cache, and to the app shell for navigations. */
const CACHE = 'taghvim-v6';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Cache only the tiny app shell up front. Hashed bundles are cached on first use.
      await Promise.allSettled(SHELL.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      await self.clients.claim();
    })()
  );
});

// Lets the page ask for an immediate update instead of waiting for a reload cycle.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

const isCacheable = (request, response) =>
  response &&
  response.ok &&
  response.type === 'basic' &&
  new URL(request.url).origin === self.location.origin;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Ignore extensions, devtools and other non-http schemes.
  if (!url.protocol.startsWith('http')) return;
  // Range requests (media seeking) must not be served from the cache.
  if (request.headers.has('range')) return;

  const immutable = url.origin === self.location.origin && url.pathname.includes('/assets/');

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      if (immutable) {
        const hit = await cache.match(request);
        if (hit) return hit;
        const fresh = await fetch(request);
        if (isCacheable(request, fresh)) cache.put(request, fresh.clone());
        return fresh;
      }

      try {
        const preload = event.preloadResponse ? await event.preloadResponse : null;
        const response = preload || (await fetch(request));
        if (isCacheable(request, response)) cache.put(request, response.clone());
        return response;
      } catch (err) {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = (await caches.match('./index.html')) || (await caches.match('./'));
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
