// Service worker : réseau d'abord (l'app est en développement actif, les
// mises à jour doivent arriver immédiatement), cache en secours pour le
// hors-ligne. Le pré-cache contourne le cache HTTP du navigateur, sinon il
// se remplit de fichiers périmés.
const CACHE = 'walkedia-shell-v5';
const SHELL = ['.', 'index.html', 'css/style.css', 'js/main.js', 'js/geo.js', 'js/graph.js', 'js/matching.js', 'js/overpass.js', 'js/storage.js', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
