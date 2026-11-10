/* Offline-first service worker for Taghvim.
   The production build injects the package version and exact hashed JS/CSS assets. */
const LP_APP_VERSION = '1.1.0';
const CACHE_PREFIX = 'taghvim-v';
const CACHE_NAME = 'taghvim-v1.1.0-4b402abe6953';
const PRECACHE_ASSETS = [
  "assets/index-DBZ0JDrg.js?v=1.1.0",
  "assets/index-k9cUyjL-.css?v=1.1.0"
];
const APP_SCOPE = self.registration.scope;
const APP_ORIGIN = new URL(APP_SCOPE).origin;
const APP_PATH = new URL(APP_SCOPE).pathname;
const versionedUrl = (path) => {
  const url = new URL(path, APP_SCOPE);
  url.searchParams.set('v', LP_APP_VERSION);
  return url.href;
};
const APP_ROOT = versionedUrl('./');
const APP_INDEX = versionedUrl('./index.html');
const OFFLINE_PAGE = versionedUrl('./offline.html');
const SHELL_URLS = [
  APP_ROOT,
  APP_INDEX,
  OFFLINE_PAGE,
  versionedUrl('./manifest.webmanifest'),
  versionedUrl('./icon.svg'),
  versionedUrl('./app-version.json'),
  versionedUrl('./css/offline.css'),
  versionedUrl('./js/offline.js'),
  ...PRECACHE_ASSETS.map(versionedUrl),
];
const NETWORK_TIMEOUT_MS = 1200;
const MEDIA_PATTERN = /\.(?:avif|bmp|gif|ico|jpe?g|mp3|m4a|wav|ogg|opus|aac|flac|mp4|webm|mov|png|svg|webp)$/i;
const NETWORK_FIRST_PATTERN = /\.(?:html?|css|m?js|json|webmanifest)$/i;

function isInAppScope(url) {
  return url.origin === APP_ORIGIN && url.pathname.startsWith(APP_PATH);
}

function isCacheable(request, response) {
  const url = new URL(request.url);
  return response
    && response.ok
    && response.type !== 'opaque'
    && response.type !== 'opaqueredirect'
    && isInAppScope(url);
}

async function cacheMatch(cache, request) {
  return cache.match(request, { ignoreSearch: true, ignoreVary: true });
}

function reloadRequest(url) {
  return new Request(url, { cache: 'reload' });
}

async function findMissingShellFiles(cache) {
  const missing = [];
  for (const url of SHELL_URLS) {
    if (!await cache.match(url, { ignoreSearch: true, ignoreVary: true })) missing.push(url);
  }
  return missing;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Reload bypasses stale HTTP cache entries; do not install a partial app shell.
    await cache.addAll(SHELL_URLS.map(reloadRequest));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const oldAppCaches = (await caches.keys())
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME);
    await Promise.all(oldAppCaches.map((key) => caches.delete(key)));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.disable().catch(() => {});
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') {
    self.skipWaiting();
    return;
  }
  if (!['LP_ENSURE_OFFLINE_READY', 'LP_CHECK_OFFLINE_READY'].includes(event.data?.type)) return;

  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    let missing = await findMissingShellFiles(cache);
    if (event.data.type === 'LP_ENSURE_OFFLINE_READY' && missing.length) {
      try {
        await cache.addAll(missing.map(reloadRequest));
        missing = await findMissingShellFiles(cache);
      } catch {
        // Report the remaining URLs to the page; cached data itself remains untouched.
      }
    }
    event.ports?.[0]?.postMessage({
      ok: missing.length === 0,
      missing,
      version: LP_APP_VERSION,
    });
  })());
});

async function fetchNetworkFirst(request, cache) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (isCacheable(request, response)) await cache.put(request, response.clone());
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (!isInAppScope(url)) return;

  const cachePromise = caches.open(CACHE_NAME);
  const networkFirst = request.mode === 'navigate' || NETWORK_FIRST_PATTERN.test(url.pathname);
  const media = MEDIA_PATTERN.test(url.pathname);

  event.respondWith((async () => {
    const cache = await cachePromise;
    const cached = await cacheMatch(cache, request);

    if (networkFirst) {
      // Skip a doomed request when the browser explicitly reports itself offline.
      if (self.navigator?.onLine === false && cached) return cached;
      try {
        return await fetchNetworkFirst(request, cache);
      } catch {
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const offline = await cacheMatch(cache, OFFLINE_PAGE);
          if (offline) return offline;
        }
        return new Response('Taghvim offline resource unavailable.', {
          status: 504,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    }

    // Images, icons, audio and video are immutable for this app shell: use cache first.
    if (media && cached) return cached;
    if (!media && cached) return cached;

    const response = await fetch(request);
    if (isCacheable(request, response)) await cache.put(request, response.clone());
    return response;
  })());
});
