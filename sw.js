// Service worker minimal : met en cache le shell de l'application.
// Les tuiles OSM et Overpass nécessitent le réseau de toute façon.
const CACHE = 'walkedia-shell-v1';
const SHELL = ['.', 'index.html', 'css/style.css', 'js/main.js', 'js/geo.js', 'js/graph.js', 'js/matching.js', 'js/overpass.js', 'js/storage.js', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
