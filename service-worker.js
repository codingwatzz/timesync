const CACHE_NAME = 'zeiterfassung-v15-offline-fix';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // { cache: 'reload' } zwingt jede Anfrage, den HTTP-Cache zu umgehen und wirklich frisch vom
      // Netz zu laden – sonst könnte GitHub Pages' ~10-min Cache-Control auch hier veraltete
      // Dateien in unseren eigenen Service-Worker-Cache einschleusen.
      Promise.all(APP_SHELL.map((url) =>
        fetch(url, { cache: 'reload' }).then((resp) => cache.put(url, resp))
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first für bereits gecachte Ressourcen, sonst Netzwerk - und JEDE erfolgreiche
// Netzwerk-Antwort wird nachträglich mit in den Cache aufgenommen (nicht nur die feste
// APP_SHELL-Liste). Das ist nötig, weil Vite bei jedem Build neue Datei-Hashes erzeugt
// (z.B. assets/index-XYZ.js) - diese stehen nie in der statischen APP_SHELL-Liste, müssen
// aber trotzdem für echte Offline-Nutzung verfügbar sein.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
