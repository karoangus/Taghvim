/* Offline-first service worker for Taghvim.
   The production build injects the app version and every built local asset. */
const LP_APP_VERSION = '1.3.0';
const CACHE_PREFIX = 'taghvim-v';
const CACHE_NAME = 'taghvim-v1.3.0-ffb3d9c9b55e';
const PRECACHE_ASSETS = [
  "assets/index-8hyIBKNv.css?v=1.3.0",
  "assets/index-C1Xc63Tx.js?v=1.3.0",
  "css/offline.css?v=1.3.0",
  "icon.svg?v=1.3.0",
  "js/offline.js?v=1.3.0"
];
const APP_SCOPE = self.registration.scope;
const APP_ORIGIN = new URL(APP_SCOPE).origin;
const APP_PATH = new URL(APP_SCOPE).pathname;
const NETWORK_TIMEOUT_MS = 1800;
const NETWORK_FIRST_PATTERN = /\.(?:html?|css|m?js|json|webmanifest)$/i;

const versionedUrl = (path) => {
  const url = new URL(path, APP_SCOPE);
  url.searchParams.set('v', LP_APP_VERSION);
  return url.href;
};

const APP_ROOT = versionedUrl('./');
const APP_INDEX = versionedUrl('./index.html');
const OFFLINE_PAGE = versionedUrl('./offline.html');
const SHELL_URLS = [...new Set([
  APP_ROOT,
  APP_INDEX,
  OFFLINE_PAGE,
  versionedUrl('./manifest.json'),
  versionedUrl('./manifest.webmanifest'),
  versionedUrl('./icon.svg'),
  versionedUrl('./app-version.json'),
  versionedUrl('./css/offline.css'),
  versionedUrl('./js/offline.js'),
  ...PRECACHE_ASSETS.map(versionedUrl),
])];

function isInAppScope(url) {
  return url.origin === APP_ORIGIN && url.pathname.startsWith(APP_PATH);
}

function isHtml(request, url = new URL(request.url)) {
  const accept = request.headers?.get?.('accept') || '';
  return request.mode === 'navigate'
    || /\.html?$/i.test(url.pathname)
    || /text\/html/i.test(accept);
}

function isNetworkFirst(request, url) {
  return isHtml(request, url) || NETWORK_FIRST_PATTERN.test(url.pathname);
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
  const options = { ignoreSearch: true, ignoreVary: true };
  return await caches.match(request, options) || await cache.match(request, options);
}

async function offlinePageResponse(cache) {
  const fallback = await cacheMatch(cache, OFFLINE_PAGE);
  if (!fallback) return null;
  const baseHref = APP_SCOPE.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = await fallback.text();
  const scopedHtml = html.replace(/<head\b[^>]*>/i, (head) => `${head}\n    <base href="${baseHref}">`);
  const headers = new Headers(fallback.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Content-Type', headers.get('Content-Type') || 'text/html; charset=utf-8');
  return new Response(scopedHtml, {
    status: fallback.status,
    statusText: fallback.statusText,
    headers,
  });
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

async function fetchAndCache(url, cache) {
  const request = reloadRequest(url);
  const response = await fetch(request);
  if (!response.ok) throw new Error(`Could not precache ${url}: HTTP ${response.status}`);
  await cache.put(request, response.clone());
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Bypass the HTTP cache and install only a complete, current app shell.
    await Promise.all(SHELL_URLS.map((url) => fetchAndCache(url, cache)));
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
      await Promise.all(missing.map((url) => fetchAndCache(url, cache).catch(() => {})));
      missing = await findMissingShellFiles(cache);
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
    // `no-store` bypasses an HTTP cache entry which could otherwise mask the latest shell.
    const response = await fetch(request.url, {
      cache: 'no-store',
      credentials: request.credentials || 'same-origin',
      headers: request.headers,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Network response was ${response.status}`);
    if (isCacheable(request, response)) await cache.put(request, response.clone()).catch(() => {});
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

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cacheMatch(cache, request);
    const htmlRequest = isHtml(request, url);

    if (isNetworkFirst(request, url)) {
      // Avoid an obviously doomed request when the browser reports no connection.
      if (self.navigator?.onLine === false && cached) return cached;
      try {
        return await fetchNetworkFirst(request, cache);
      } catch {
        if (cached) return cached;
        if (htmlRequest) {
          const offline = await offlinePageResponse(cache);
          if (offline) return offline;
        }
        return new Response('Taghvim offline resource unavailable.', {
          status: 504,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    }

    // Every other same-origin resource is cache-first, then cached after a miss.
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (isCacheable(request, response)) await cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch {
      return new Response('Taghvim offline resource unavailable.', {
        status: 504,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
