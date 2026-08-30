// Service Worker mit Auto-Update: sobald eine neue service-worker.js-Version erkannt wird,
// übernimmt sie sofort die Kontrolle (skipWaiting + clients.claim im SW) und die Seite lädt
// sich automatisch neu - kein manuelles Cache-Leeren während der aktiven Entwicklung nötig.
export function registerServiceWorker(onUpdateReload: () => void): void {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  window.addEventListener('load', () => {
    // updateViaCache:'none' zwingt den Browser, service-worker.js bei jeder Prüfung IMMER
    // frisch vom Netz zu laden statt aus dem HTTP-Cache - nötig, weil GitHub Pages von sich
    // aus einen ~10-minütigen Cache-Control-Header setzt, der Updates sonst verzögern würde.
    navigator.serviceWorker
      .register('./service-worker.js', { updateViaCache: 'none' })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});

    let reloadedAlready = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedAlready) return; // Sicherheitsnetz gegen Neuladeschleifen
      reloadedAlready = true;
      onUpdateReload();
      setTimeout(() => window.location.reload(), 400);
    });
  });
}
