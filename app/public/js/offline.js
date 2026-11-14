/* Shared offline, storage and PWA-install hooks for the app shell. */
(() => {
  const LP_APP_VERSION = '__LP_APP_VERSION__';
  const STORAGE_PERSISTENCE_KEY = 'taghvim-storage-persisted';
  const OFFLINE_TIMEOUT_MS = 10000;
  let deferredInstallPrompt = null;
  let installedFromEvent = false;
  let previousOnline = navigator.onLine !== false;

  const dispatch = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  const isStandalone = () => Boolean(
    installedFromEvent
      || window.matchMedia?.('(display-mode: standalone)').matches
      || navigator.standalone === true,
  );
  const lpCanInstall = () => !isStandalone() && Boolean(deferredInstallPrompt);

  function storePersistenceStatus(status) {
    try { localStorage.setItem(STORAGE_PERSISTENCE_KEY, status); } catch { /* private mode */ }
    dispatch('lp:persistence-status', { status });
    return status;
  }

  async function ensurePersist() {
    const storage = navigator.storage;
    if (!storage?.persisted) return storePersistenceStatus('unsupported');
    try {
      let persisted = await storage.persisted();
      if (!persisted) {
        if (!storage.persist) return storePersistenceStatus('unsupported');
        await storage.persist();
        persisted = await storage.persisted();
      }
      return storePersistenceStatus(persisted ? 'granted' : 'not-granted');
    } catch {
      return storePersistenceStatus('not-granted');
    }
  }

  function sendWorkerMessage(type, timeoutMs = OFFLINE_TIMEOUT_MS) {
    if (!('serviceWorker' in navigator) || !window.MessageChannel) {
      return Promise.resolve({ ok: false, reason: 'unsupported', missing: [] });
    }

    return new Promise((resolve) => {
      let finished = false;
      let channel;
      const finish = (result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        channel?.port1?.close?.();
        channel?.port2?.close?.();
        resolve(result);
      };
      const timer = setTimeout(() => finish({ ok: false, reason: 'timeout', missing: [] }), timeoutMs);

      navigator.serviceWorker.ready.then((registration) => {
        if (finished) return;
        const worker = registration.active || navigator.serviceWorker.controller;
        if (!worker) {
          finish({ ok: false, reason: 'not-active', missing: [] });
          return;
        }
        channel = new MessageChannel();
        channel.port1.onmessage = (event) => finish(event.data || { ok: false, reason: 'empty-response', missing: [] });
        worker.postMessage({ type, version: LP_APP_VERSION }, [channel.port2]);
      }).catch(() => finish({ ok: false, reason: 'unavailable', missing: [] }));
    });
  }

  async function lpEnsureOfflineReady() {
    const persistence = await ensurePersist();
    const cache = await sendWorkerMessage('LP_ENSURE_OFFLINE_READY');
    return { ...cache, persistence };
  }

  function lpTestOffline() {
    return sendWorkerMessage('LP_CHECK_OFFLINE_READY');
  }

  async function lpTriggerInstall() {
    if (isStandalone()) return { outcome: 'already-installed' };
    if (!deferredInstallPrompt) return { outcome: 'unavailable' };
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      dispatch('lp:install-state', choice);
      return choice;
    } catch {
      const result = { outcome: 'error' };
      dispatch('lp:install-state', result);
      return result;
    }
  }

  async function renderOfflineCard() {
    const [persistence, cache] = await Promise.all([ensurePersist(), lpTestOffline()]);
    const state = {
      version: LP_APP_VERSION,
      online: navigator.onLine !== false,
      persistence,
      cache,
      installAvailable: lpCanInstall(),
      standalone: isStandalone(),
    };
    const status = document.getElementById('offlineStatusText');
    if (status) {
      status.dataset.cacheState = cache.ok ? 'ready' : cache.missing?.length ? 'missing' : 'unavailable';
    }
    const versionLabel = document.getElementById('settingsVersion');
    if (versionLabel) versionLabel.dataset.version = LP_APP_VERSION;
    dispatch('lp:offline-card', state);
    return state;
  }

  function showFallbackNetworkToast(online) {
    // The React app renders its own translated toast. The offline fallback has no React root.
    if (document.querySelector('.app-shell')) return;
    const oldToast = document.querySelector('.offline-toast');
    oldToast?.remove();
    const toast = document.createElement('div');
    toast.className = 'offline-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    const isPersian = document.documentElement.lang.startsWith('fa');
    toast.textContent = isPersian
      ? (online ? 'اتصال اینترنت برقرار شد.' : 'اتصال اینترنت قطع شد؛ برنامه‌ی ذخیره‌شده در دسترس است.')
      : (online ? 'Internet connection restored.' : 'Internet is off; the saved app remains available.');
    document.body.append(toast);
    setTimeout(() => toast.remove(), 3600);
  }

  function updateNetworkStatus() {
    const online = navigator.onLine !== false;
    const changed = online !== previousOnline;
    previousOnline = online;
    document.documentElement.classList.toggle('lp-network-offline', !online);
    const banner = document.getElementById('offlineBanner');
    const badge = document.getElementById('offlineBadge');
    if (banner) banner.hidden = online;
    if (badge) badge.hidden = online;
    dispatch('lp:network-change', { online, changed });
    if (changed) showFallbackNetworkToast(online);
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    dispatch('lp:install-prompt', { available: lpCanInstall() });
  });

  window.addEventListener('appinstalled', () => {
    installedFromEvent = true;
    deferredInstallPrompt = null;
    dispatch('lp:app-installed');
  });

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  window.addEventListener('DOMContentLoaded', () => {
    const versionLabel = document.getElementById('lp-offline-version');
    if (versionLabel) versionLabel.textContent = LP_APP_VERSION;
    document.getElementById('offlineRetry')?.addEventListener('click', async () => {
      try {
        const registration = await navigator.serviceWorker?.getRegistration?.();
        const appRoot = registration?.scope || new URL('./', document.baseURI).href;
        window.location.href = new URL(`index.html?v=${LP_APP_VERSION}`, appRoot).href;
      } catch {
        window.location.reload();
      }
    });
    updateNetworkStatus();
  }, { once: true });
  updateNetworkStatus();

  window.ensurePersist = ensurePersist;
  window.lpEnsureOfflineReady = lpEnsureOfflineReady;
  window.lpTestOffline = lpTestOffline;
  window.lpTriggerInstall = lpTriggerInstall;
  window.lpCanInstall = lpCanInstall;
  window.renderOfflineCard = renderOfflineCard;
  window.LPOffline = {
    version: LP_APP_VERSION,
    isStandalone,
    get hasInstallPrompt() { return Boolean(deferredInstallPrompt); },
    promptInstall: lpTriggerInstall,
  };
})();
