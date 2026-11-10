/* Service-worker smoke test: verify the production precache and prove that a
   cached navigation, a deep route and the JS bundle still work with fetch offline. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(rootDir, 'index.html'), 'utf8');
const workerSource = readFileSync(join(rootDir, 'sw.js'), 'utf8');
const assetNames = readdirSync(join(rootDir, 'assets')).sort();
const scope = 'https://karoangus.github.io/Taghvim/';
const scriptUrl = new URL('sw.js', scope).href;
const workerCacheName = workerSource.match(/const CACHE_NAME = '([^']+)'/)?.[1];

assert.match(workerCacheName || '', /^taghvim-v\d+\.\d+\.\d+-[a-f0-9]{12}$/, 'build gives the worker a deterministic versioned cache');
assert.ok(!workerSource.includes('__TAGHVIM_') && !workerSource.includes('__LP_APP_VERSION__'),
  'the built service worker has no unfilled build markers');

const precacheBody = workerSource.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\n\];/)?.[1];
assert.ok(precacheBody, 'production asset precache is present');
const precacheAssets = JSON.parse(`[${precacheBody}]`);
const precachePaths = precacheAssets.map((asset) => asset.split('?')[0]);
const packageVersion = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')).version;
const appVersion = JSON.parse(readFileSync(join(rootDir, 'app-version.json'), 'utf8')).version;
assert.equal(appVersion, packageVersion, 'app-version.json agrees with package.json');
assert.ok(precacheAssets.every((asset) => asset.endsWith(`?v=${packageVersion}`)),
  'all fingerprinted app bundles carry the app version query');
const versionedAppAssets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:m?js|css))\?v=([^"']+)["']/gi)];
assert.ok(versionedAppAssets.length >= 4, 'index.html references the app and offline helper CSS/JS');
for (const [, , referencedVersion] of versionedAppAssets) {
  assert.equal(referencedVersion, packageVersion, 'all production JS/CSS references are versioned');
}
for (const asset of assetNames) {
  assert.ok(precachePaths.includes(`assets/${asset}`), `${asset} is precached during install`);
}
for (const [, reference] of html.matchAll(/(?:src|href)=["']\.\/assets\/([^"'?#]+)["']/g)) {
  assert.ok(precachePaths.includes(`assets/${reference}`), `${reference} linked from index.html is precached`);
}
for (const file of ['offline.html', 'manifest.webmanifest', 'icon.svg', 'app-version.json', 'css/offline.css', 'js/offline.js']) {
  assert.ok(workerSource.includes(`./${file}`), `${file} is explicitly included in the worker shell`);
}

let online = true;
const networkInfo = { onLine: true };
let skipWaitingCalled = false;
let clientsClaimed = false;
let preloadDisabled = false;
const networkRequests = [];
const listeners = new Map();
const cacheData = new Map();

const requestUrl = (request) => {
  const value = typeof request === 'string' ? request : request?.url;
  return new URL(value, scriptUrl).href;
};

async function mockFetch(request) {
  const url = requestUrl(request);
  networkRequests.push(url);
  if (!online) throw new TypeError('Network is offline');
  return new Response(`network response: ${url}`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function cacheFor(name) {
  if (!cacheData.has(name)) cacheData.set(name, new Map());
  const entries = cacheData.get(name);
  return {
    async addAll(requests) {
      const added = [];
      for (const request of requests) {
        const url = requestUrl(request);
        const response = await mockFetch(url);
        if (!response.ok) throw new Error(`Could not precache ${url}`);
        added.push([url, response.clone()]);
      }
      for (const [url, response] of added) entries.set(url, response);
    },
    async match(request, options = {}) {
      const key = requestUrl(request);
      let response = entries.get(key);
      if (!response && options.ignoreSearch) {
        const wanted = new URL(key);
        response = [...entries.entries()].find(([candidate]) => {
          const candidateUrl = new URL(candidate);
          return candidateUrl.origin === wanted.origin
            && candidateUrl.pathname === wanted.pathname;
        })?.[1];
      }
      return response?.clone();
    },
    async put(request, response) {
      entries.set(requestUrl(request), response.clone());
    },
  };
}

const caches = {
  async open(name) {
    cacheFor(name);
    return cacheFor(name);
  },
  async keys() {
    return [...cacheData.keys()];
  },
  async delete(name) {
    return cacheData.delete(name);
  },
};

const self = {
  location: new URL(scriptUrl),
  navigator: networkInfo,
  registration: {
    scope,
    navigationPreload: {
      async disable() { preloadDisabled = true; },
    },
  },
  clients: {
    async claim() { clientsClaimed = true; },
  },
  addEventListener(type, listener) { listeners.set(type, listener); },
  async skipWaiting() { skipWaitingCalled = true; },
};

vm.runInNewContext(workerSource, {
  self,
  caches,
  URL,
  Request,
  Response,
  Promise,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: mockFetch,
});

let installLifetime;
listeners.get('install')({ waitUntil(promise) { installLifetime = promise; } });
await installLifetime;
assert.ok(skipWaitingCalled, 'the fully cached worker activates immediately');
assert.ok(cacheData.get(workerCacheName).size >= 10, 'the full app shell and production assets were saved');
const installedUrls = [...cacheData.get(workerCacheName).keys()];
assert.ok(installedUrls.includes(`${scope}?v=${packageVersion}`), 'the versioned start page is cached');
assert.ok(installedUrls.includes(`${new URL('index.html', scope).href}?v=${packageVersion}`), 'versioned index.html is cached');
assert.ok(installedUrls.includes(`${new URL('manifest.webmanifest', scope).href}?v=${packageVersion}`), 'the versioned install manifest is cached');
for (const file of ['offline.html', 'icon.svg', 'app-version.json', 'css/offline.css', 'js/offline.js']) {
  assert.ok(installedUrls.includes(`${new URL(file, scope).href}?v=${packageVersion}`), `${file} is versioned and cached`);
}

await caches.open('taghvim-v1.0.0-old');
await caches.open('another-app-cache');
let activateLifetime;
listeners.get('activate')({ waitUntil(promise) { activateLifetime = promise; } });
await activateLifetime;
assert.deepEqual((await caches.keys()).sort(), [workerCacheName, 'another-app-cache'].sort(),
  'activation removes stale Taghvim caches without deleting other apps caches');
assert.ok(clientsClaimed, 'the active worker controls the app immediately');
assert.ok(preloadDisabled, 'unneeded navigation preloading is disabled');

async function askWorker(type) {
  let reply;
  let lifetime;
  listeners.get('message')({
    data: { type },
    ports: [{ postMessage(value) { reply = value; } }],
    waitUntil(promise) { lifetime = promise; },
  });
  await lifetime;
  return reply;
}

let readiness = await askWorker('LP_CHECK_OFFLINE_READY');
assert.ok(readiness?.ok, 'the settings test command confirms a complete offline shell');
const cssAsset = precacheAssets.find((asset) => /\.css\?/i.test(asset));
const cssUrl = new URL(cssAsset, scope).href;
cacheData.get(workerCacheName).delete(cssUrl);
readiness = await askWorker('LP_CHECK_OFFLINE_READY');
assert.equal(readiness?.missing?.length, 1, 'offline test reports an incomplete cache honestly');
readiness = await askWorker('LP_ENSURE_OFFLINE_READY');
assert.ok(readiness?.ok, 'Save offline repairs missing files when connected');
assert.ok(cacheData.get(workerCacheName).has(cssUrl), 'the missing stylesheet was restored');

const fetchHandler = listeners.get('fetch');
const makeRequest = (url, mode = 'cors', method = 'GET') => ({
  url,
  mode,
  method,
  headers: new Headers(),
});

async function dispatchFetch(request) {
  let responsePromise;
  const lifetimePromises = [];
  fetchHandler({
    request,
    respondWith(promise) { responsePromise = promise; },
    waitUntil(promise) { lifetimePromises.push(promise); },
  });
  assert.ok(responsePromise, `the worker handles ${request.url}`);
  const response = await responsePromise;
  await Promise.all(lifetimePromises);
  return response;
}

const mainAsset = precacheAssets.find((asset) => /\.js(?:\?|$)/i.test(asset));
const mainAssetUrl = new URL(mainAsset, scope).href;
networkRequests.length = 0;
const onlineBundleResponse = await dispatchFetch(makeRequest(mainAssetUrl));
assert.ok((await onlineBundleResponse.text()).includes('network response:'),
  'network-first resources prefer a successful online response');
assert.ok(networkRequests.includes(mainAssetUrl), 'the online JS request reached the network');

online = false;
networkInfo.onLine = true; // simulate a network block while the device still reports Wi-Fi
networkRequests.length = 0;
const homeResponse = await dispatchFetch(makeRequest(scope, 'navigate'));
assert.match(await homeResponse.text(), /network response:/, 'cached home page opens with no network');
assert.ok(networkRequests.includes(scope), 'navigation uses network-first before falling back to its cached page');
networkInfo.onLine = false;
networkRequests.length = 0;
const reportedOfflineHome = await dispatchFetch(makeRequest(scope, 'navigate'));
assert.match(await reportedOfflineHome.text(), /network response:/, 'an explicitly offline browser uses the cached page immediately');
assert.equal(networkRequests.length, 0, 'the worker avoids futile fetches when the browser reports offline');
networkInfo.onLine = true;

const deepPage = new URL('week/2', scope).href;
const deepResponse = await dispatchFetch(makeRequest(deepPage, 'navigate'));
assert.ok((await deepResponse.text()).includes(new URL('offline.html', scope).href),
  'offline deep links fall back to the cached offline page');

const bundleResponse = await dispatchFetch(makeRequest(mainAssetUrl));
assert.ok((await bundleResponse.text()).includes('network response:'),
  'the production JavaScript bundle is served from cache offline');

let externalWasHandled = false;
fetchHandler({
  request: makeRequest('https://example.com/third-party.js'),
  respondWith() { externalWasHandled = true; },
  waitUntil() {},
});
assert.equal(externalWasHandled, false, 'requests outside the app are left untouched');

console.log('✅ Offline smoke passed: complete precache, cached start/deep navigation and JS work offline.');
