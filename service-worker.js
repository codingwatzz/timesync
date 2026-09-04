// __BUILD_ID__ wird beim Deploy durch den echten Commit-SHA ersetzt (siehe
// deploy-production.yml) - garantiert, dass service-worker.js bei JEDEM Deploy tatsächlich
// bytegenau anders ist, damit der Browser eine neue Version zuverlässig erkennt (sonst bleibt
// eine alte, installierte SW-Version u.U. unbegrenzt aktiv, weil "kein Unterschied" erkannt
// wird - genau das führte am 02.09.2026 dazu, dass Updates ohne manuelles Cache-Leeren nicht
// mehr ankamen).
const CACHE_NAME = 'zeiterfassung-d32bceb4a0c25076adc5b96c8eb137eb72bd1af3';
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

// GEÄNDERT (02.09.2026): Network-first statt Cache-first. Vorher: bereits gecachte Anfragen
// wurden SOFORT aus dem Cache beantwortet, das Netzwerk lief nur im Hintergrund für die
// NÄCHSTE Anfrage mit - dadurch waren Updates immer einen ganzen Ladevorgang "hinterher" und
// bei installierten PWAs (Homescreen-App) teils gar nicht mehr sichtbar, ohne den Cache manuell
// zu leeren. Jetzt: Netzwerk hat immer Vorrang, sobald online - der Cache dient nur noch als
// Fallback für echten Offline-Betrieb (siehe test/offline-test.js). { cache: 'reload' } umgeht
// zusätzlich GitHub Pages' eigenen kurzen HTTP-Cache-Header, damit "online" auch wirklich
// "frisch vom Server" bedeutet. Nur Anfragen an den eigenen Origin werden abgefangen - Anfragen
// an Appwrite (anderer Origin, z.B. Beleg-Downloads) laufen unverändert direkt durch, statt in
// diesem Cache zu landen.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: 'reload' })
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
