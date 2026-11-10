/* Shared PWA hooks. This tiny file is intentionally local and versioned with the app. */
(() => {
  const LP_APP_VERSION = '__LP_APP_VERSION__';
  let deferredInstallPrompt = null;

  const isStandalone = () => Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true,
  );

  const dispatch = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  const updateNetworkClass = () => {
    const online = navigator.onLine !== false;
    document.documentElement.classList.toggle('lp-network-offline', !online);
    dispatch('lp:network-change', { online });
  };

  window.LPOffline = {
    version: LP_APP_VERSION,
    isStandalone,
    get hasInstallPrompt() { return Boolean(deferredInstallPrompt); },
    async promptInstall() {
      if (!deferredInstallPrompt) return { outcome: 'unavailable' };
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        dispatch('lp:install-state', choice);
        return choice;
      } catch {
        dispatch('lp:install-state', { outcome: 'error' });
        return { outcome: 'error' };
      }
    },
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    dispatch('lp:install-prompt');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    dispatch('lp:app-installed');
  });

  window.addEventListener('online', updateNetworkClass);
  window.addEventListener('offline', updateNetworkClass);
  updateNetworkClass();

  document.addEventListener('DOMContentLoaded', () => {
    const versionLabel = document.getElementById('lp-offline-version');
    if (versionLabel) versionLabel.textContent = LP_APP_VERSION;
  });
})();
