/* Exercise the shared offline/PWA browser hooks without a real browser or network. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')).version;
const helperSource = readFileSync(join(rootDir, 'js', 'offline.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><html lang="fa" dir="rtl"><body>
  <div id="offlineBanner" hidden></div>
  <span id="offlineBadge" hidden></span>
  <span id="offlineStatusText"></span>
  <small id="settingsVersion"></small>
</body></html>`, { url: 'https://karoangus.github.io/Taghvim/', runScripts: 'outside-only' });
const { window } = dom;

let persisted = false;
let persistCalls = 0;
Object.defineProperty(window.navigator, 'storage', {
  configurable: true,
  value: {
    async persisted() { return persisted; },
    async persist() { persistCalls += 1; persisted = true; return true; },
  },
});
let standalone = false;
window.matchMedia = (query) => ({
  matches: query.includes('standalone') && standalone,
  addEventListener() {},
  removeEventListener() {},
});

class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null, close() {} };
    this.port2 = {
      close() {},
      postMessage: (data) => this.port1.onmessage?.({ data }),
    };
  }
}
window.MessageChannel = TestMessageChannel;
const postedMessages = [];
const activeWorker = {
  postMessage(message, ports) {
    postedMessages.push(message);
    setTimeout(() => ports[0].postMessage({ ok: true, missing: [], version }), 0);
  },
};
Object.defineProperty(window.navigator, 'serviceWorker', {
  configurable: true,
  value: { ready: Promise.resolve({ active: activeWorker }), controller: activeWorker },
});
Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });

window.eval(helperSource);
assert.equal(typeof window.ensurePersist, 'function', 'ensurePersist is exposed to the app');
assert.equal(typeof window.lpEnsureOfflineReady, 'function', 'cache repair API is exposed');
assert.equal(typeof window.lpTestOffline, 'function', 'offline check API is exposed');
assert.equal(typeof window.lpTriggerInstall, 'function', 'install trigger API is exposed');
assert.equal(typeof window.lpCanInstall, 'function', 'install availability API is exposed');
assert.equal(typeof window.renderOfflineCard, 'function', 'settings card refresh API is exposed');

const persistence = await window.ensurePersist();
assert.equal(persistence, 'granted', 'persist() is requested and verified with persisted()');
assert.equal(persistCalls, 1, 'persist() is called once when storage is not yet persistent');
assert.equal(window.localStorage.getItem('taghvim-storage-persisted'), 'granted', 'persistence state is saved locally');

let networkChange;
window.addEventListener('lp:network-change', (event) => { networkChange = event.detail; });
Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
window.dispatchEvent(new window.Event('offline'));
assert.equal(window.document.getElementById('offlineBanner').hidden, false, 'offline event reveals the banner');
assert.equal(window.document.getElementById('offlineBadge').hidden, false, 'offline event reveals the top-bar badge');
assert.equal(networkChange?.online, false, 'offline event broadcasts network state');
assert.ok(window.document.querySelector('.offline-toast')?.textContent.includes('اتصال اینترنت قطع شد'), 'offline fallback shows a toast');
Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
window.dispatchEvent(new window.Event('online'));
assert.equal(window.document.getElementById('offlineBanner').hidden, true, 'online event hides the banner');
assert.equal(window.document.getElementById('offlineBadge').hidden, true, 'online event hides the badge');
assert.ok(window.document.querySelector('.offline-toast')?.textContent.includes('اتصال اینترنت برقرار شد'), 'online fallback shows a toast');

assert.equal(window.lpCanInstall(), false, 'installation is unavailable before the browser prompt');
let promptCalled = false;
const installPrompt = new window.Event('beforeinstallprompt', { cancelable: true });
installPrompt.prompt = async () => { promptCalled = true; };
installPrompt.userChoice = Promise.resolve({ outcome: 'accepted' });
window.dispatchEvent(installPrompt);
assert.equal(installPrompt.defaultPrevented, true, 'the app captures the native install prompt');
assert.equal(window.lpCanInstall(), true, 'the app reports an available install prompt');
assert.deepEqual(await window.lpTriggerInstall(), { outcome: 'accepted' }, 'the install API returns the browser choice');
assert.equal(promptCalled, true, 'the native prompt was shown on demand');
assert.equal(window.lpCanInstall(), false, 'the single-use native prompt is cleared after use');

const repaired = await window.lpEnsureOfflineReady();
assert.equal(repaired.ok, true, 'offline repair reaches the active service worker');
assert.equal(repaired.persistence, 'granted', 'offline repair returns the persistence result');
assert.equal(postedMessages.at(-1).type, 'LP_ENSURE_OFFLINE_READY', 'repair sends the right worker message');
const tested = await window.lpTestOffline();
assert.equal(tested.ok, true, 'offline test checks the active service worker');
assert.equal(postedMessages.at(-1).type, 'LP_CHECK_OFFLINE_READY', 'test sends a non-mutating worker check');

let renderedCard;
window.addEventListener('lp:offline-card', (event) => { renderedCard = event.detail; });
const cardState = await window.renderOfflineCard();
assert.equal(cardState.cache.ok, true, 'settings card state includes cache completeness');
assert.equal(cardState.persistence, 'granted', 'settings card state includes storage persistence');
assert.equal(window.document.getElementById('offlineStatusText').dataset.cacheState, 'ready', 'settings card exposes cache readiness');
assert.equal(window.document.getElementById('settingsVersion').dataset.version, version, 'settings version stays synchronized');
assert.equal(renderedCard.version, version, 'settings card render event includes the app version');
standalone = true;
assert.equal(window.LPOffline.isStandalone(), true, 'standalone mode is detected using matchMedia');
assert.equal(window.lpCanInstall(), false, 'an already-installed standalone app cannot prompt again');

console.log('✅ Offline UI smoke passed: persistence, network status, install, cache actions and settings state.');
