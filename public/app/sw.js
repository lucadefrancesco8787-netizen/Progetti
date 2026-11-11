/*
 * Service worker dell'app: tiene in cache la "scocca" (HTML, CSS, JS, icone) così l'app si apre subito
 * anche con rete scarsa. I dati personali (/api) passano sempre dalla rete e non vengono mai salvati.
 * Quando cambi app.js o app.css, aumenta VERSIONE per far aggiornare i telefoni.
 */
const VERSIONE = 'zc-app-v11';
const SCOCCA = ['/app/', '/app/app.css', '/app/app.js', '/app/staff.js', '/app/timer.js', '/app/manifest.webmanifest', '/app/icons/icon-180.png', '/app/icons/icon-192.png', '/img/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(SCOCCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Prima la rete (così vedi sempre l'ultima versione), la cache solo se sei offline
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && SCOCCA.includes(url.pathname)) {
          const copia = res.clone();
          caches.open(VERSIONE).then((c) => c.put(e.request, copia));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('/app/')))
  );
});
