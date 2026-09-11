/* Installation and offline readiness, separate from the game engine. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('install-dialog'), installButton = $('install-confirm');
  const dialogHome = dialog.parentElement;
  const standalone = matchMedia('(display-mode: standalone)');
  const isInstalled = () => standalone.matches || navigator.standalone === true;
  const secure = window.isSecureContext && 'serviceWorker' in navigator;
  const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferredPrompt = null, registration = null, prompted = false, pendingSuggestion = false, installedHere = false;
  let firstGameFinished = false;
  let offlineError = '', installError = '';
  let showInstructions = false, installationAccepted = false;
  let offlineReady = false, updateRequested = false, reloading = false, installing = false;
  const dismissalKey = 'etotu:install-dismissed-until';
  const setDismissal = () => { try { localStorage.setItem(dismissalKey, String(Date.now() + 7 * 86400000)); } catch { /* Session-only dismissal still works. */ } };
  const dismissed = () => { try { return Number(localStorage.getItem(dismissalKey)) > Date.now(); } catch { return false; } };
  const inMission = () => $('arena').classList.contains('playing') || $('arena').classList.contains('paused');
  const safeToSuggest = () => !inMission() && !$('help-dialog').open && !document.hidden;

  function renderInstall() {
    const installed = isInstalled() || installedHere;
    $('install-open').hidden = !secure || installed;
    $('offline-status').textContent = (installationAccepted ? 'Instalación solicitada. Esperando la confirmación del navegador…' : '') || installError || offlineError || (offlineReady ? 'Juego completo listo sin conexión' : 'Preparando el juego para usarlo sin conexión…');
    $('install-instructions').hidden = Boolean(deferredPrompt) || !showInstructions;
    $('install-instructions').textContent = isAppleMobile
      ? 'Abre el menú Compartir del navegador y elige “Añadir a pantalla de inicio”. Si aparece “Abrir como app”, déjalo activado y confirma con “Añadir”.'
      : 'Abre el menú de tu navegador y busca “Instalar aplicación” o “Añadir a pantalla de inicio”. Si no aparece, prueba un navegador compatible con instalación de apps web.';
    installButton.textContent = installationAccepted ? 'Instalación solicitada…' : installing ? 'Abriendo instalación…' : deferredPrompt ? 'Instalar app ↗' : 'Cómo instalar la app';
    installButton.disabled = installing || installationAccepted;
    if (installed && dialog.open) dialog.close();
  }
  function openInstall(manual = false) {
    if (!secure || isInstalled() || installedHere || dialog.open) return;
    if (!manual && (!safeToSuggest() || dismissed() || prompted)) return;
    if (manual) document.dispatchEvent(new Event('etotu:pause'));
    prompted = true; pendingSuggestion = false;
    const host = document.fullscreenElement || ($('game-panel').classList.contains('expanded') ? $('game-panel') : dialogHome);
    if (dialog.parentElement !== host) host.appendChild(dialog);
    renderInstall(); dialog.showModal();
  }
  function refresh() {
    if (!firstGameFinished && $('arena').classList.contains('ended')) {
      firstGameFinished = true; pendingSuggestion = true;
    }
    if (pendingSuggestion) openInstall();
    $('app-update').hidden = !registration?.waiting || inMission() || dialog.open || updateRequested;
  }
  $('install-open').addEventListener('click', () => openInstall(true));
  $('install-later').addEventListener('click', () => dialog.close());
  $('install-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { setDismissal(); refresh(); });
  // Escape uses the dialog's native cancellation/close behavior.
  installButton.addEventListener('click', async () => {
    if (installing || installationAccepted) return;
    if (!deferredPrompt) {
      // Browsers without a native install event require their own menu. Keep the
      // instructions visible instead of closing the suggestion as if installed.
      showInstructions = true;
      installError = 'Sigue estos pasos para añadir la app. El navegador debe confirmar la instalación.';
      renderInstall(); return;
    }
    const prompt = deferredPrompt;
    deferredPrompt = null; // Each browser event can only be prompted once.
    installing = true; installError = ''; renderInstall();
    try {
      // Invoke synchronously from this click, before awaiting any other work.
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        // Acceptance starts installation; appinstalled confirms completion.
        installationAccepted = !installedHere;
      } else {
        showInstructions = true;
        installError = 'Instalación cancelada. Puedes intentarlo desde el menú del navegador.';
      }
    } catch {
      showInstructions = true;
      installError = 'No se pudo abrir la instalación. Puedes usar el menú del navegador.';
    } finally { installing = false; renderInstall(); }
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferredPrompt = event; installError = ''; showInstructions = false;
    renderInstall(); refresh();
  });
  window.addEventListener('appinstalled', () => {
    installedHere = true; installationAccepted = false; deferredPrompt = null; renderInstall();
  });
  standalone.addEventListener('change', renderInstall);
  new MutationObserver(refresh).observe($('arena'), { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(refresh).observe($('help-dialog'), { attributes: true, attributeFilter: ['open'] });
  document.addEventListener('visibilitychange', refresh);
  renderInstall();
  if (!secure) { $('offline-status').textContent = 'La instalación requiere abrir el juego desde HTTPS o localhost.'; return; }

  $('update-app').addEventListener('click', () => {
    if (!registration?.waiting || inMission()) return;
    updateRequested = true; refresh();
    registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // First-time activation and updates from another tab never reload a live mission.
    if (updateRequested && !reloading) { reloading = true; location.reload(); }
  });
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(reg => {
    registration = reg; refresh();
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', refresh);
    });
    return navigator.serviceWorker.ready;
  }).then(() => {
    offlineReady = true; renderInstall();
    $('app-availability').textContent = 'DISPONIBLE SIN CONEXIÓN';
    refresh();
  }).catch(() => {
    offlineError = 'No se pudo preparar el modo sin conexión. Vuelve a abrir el juego con conexión e inténtalo otra vez.'; renderInstall();
    $('app-availability').textContent = 'JUEGO EN LÍNEA';
    refresh();
  });
})();
