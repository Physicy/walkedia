import { fetchNetwork } from './overpass.js';
import { buildGraph } from './graph.js';
import { Matcher } from './matching.js';
import { makeProj, haversine } from './geo.js';
import * as storage from './storage.js';

const RADIUS = 800;          // rayon de chargement du graphe (m)
const BOUNDARY_MARGIN = 100; // marge : ne pas évaluer les intersections trop
                             // proches du bord (arêtes incidentes non chargées)

const COLORS = {
  undiscovered: '#94a3b8',
  discovered: '#06b6d4',
  incomplete: '#f59e0b',
  complete: '#22c55e',
  track: '#4f46e5',
};

const state = {
  map: null,
  graph: null,
  proj: null,
  center: null, // [lat, lon] du chargement
  progress: storage.load(),
  matcher: null,
  watchId: null,
  session: null, // { newEdges: Set, newInter: Set, trackLine, startedAt }
  edgeLayers: new Map(),
  interLayers: new Map(),
  posMarker: null,
  accCircle: null,
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- démarrage

$('btn-locate').addEventListener('click', () => {
  setStartStatus('Recherche de ta position…');
  if (!navigator.geolocation) {
    setStartStatus('Géolocalisation non disponible sur ce navigateur.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => init(pos.coords.latitude, pos.coords.longitude),
    (err) => setStartStatus(geoErrorMessage(err)),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  );
});

function setStartStatus(msg) {
  $('start-status').textContent = msg;
}

function geoErrorMessage(err) {
  if (err.code === 1) {
    // PERMISSION_DENIED : le navigateur mémorise le refus, il faut
    // ré-autoriser dans les réglages du site puis recharger.
    return "Accès à la position refusé. Autorise la position pour ce site " +
      "(icône cadenas/réglages dans la barre d'adresse → Position → Autoriser, " +
      "ou Réglages du site sur iPhone), puis recharge la page.";
  }
  if (err.code === 2) {
    return 'Position indisponible. Vérifie que la localisation du téléphone ' +
      'est activée et réessaie, de préférence en extérieur.';
  }
  if (err.code === 3) {
    return "Délai dépassé pour obtenir la position. Réessaie (le premier " +
      'fix GPS peut être lent en intérieur).';
  }
  return 'Erreur de géolocalisation : ' + err.message;
}

async function init(lat, lon) {
  setStartStatus('Chargement du réseau piéton…');
  let osm;
  try {
    osm = await fetchNetwork(lat, lon, RADIUS);
  } catch (err) {
    setStartStatus('Impossible de charger les données OSM : ' + err.message);
    return;
  }

  state.center = [lat, lon];
  state.proj = makeProj(lat);
  state.graph = buildGraph(osm);

  state.map = L.map('map', { preferCanvas: true, zoomControl: false }).setView([lat, lon], 16);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.map);

  renderGraph();
  // Une session précédente a pu compléter des intersections d'une autre zone ;
  // et des arêtes déjà découvertes peuvent compléter des intersections ici.
  sweepCompletions(false);
  refreshHud();

  $('start-screen').classList.add('hidden');
  $('btn-session').hidden = false;
  $('btn-center').hidden = false;
  toast(`${state.graph.edges.size} tronçons · ${state.graph.intersections.length} intersections dans la zone`);
}

// ---------------------------------------------------------------- rendu

function renderGraph() {
  for (const e of state.graph.edges.values()) {
    const line = L.polyline(e.coords, styleForEdge(e.id)).addTo(state.map);
    state.edgeLayers.set(e.id, line);
  }
  for (const n of state.graph.intersections) {
    const marker = L.circleMarker([n.lat, n.lon], styleForIntersection(n.key)).addTo(state.map);
    marker.bindTooltip(() => {
      const done = n.edgeIds.filter((id) => state.progress.edges.has(id)).length;
      return `${done}/${n.edgeIds.length} branches parcourues`;
    });
    state.interLayers.set(n.key, marker);
  }
}

function styleForEdge(id) {
  const found = state.progress.edges.has(id);
  return {
    color: found ? COLORS.discovered : COLORS.undiscovered,
    weight: found ? 4.5 : 2.5,
    opacity: found ? 0.95 : 0.55,
  };
}

function styleForIntersection(key) {
  const done = state.progress.intersections.has(key);
  return {
    radius: done ? 7 : 5.5,
    color: '#0f172a',
    weight: 1.5,
    fillColor: done ? COLORS.complete : COLORS.incomplete,
    fillOpacity: 0.95,
  };
}

function repaintEdge(id) {
  const layer = state.edgeLayers.get(id);
  if (layer) layer.setStyle(styleForEdge(id));
}

function repaintIntersection(key) {
  const layer = state.interLayers.get(key);
  if (layer) layer.setStyle(styleForIntersection(key));
}

function refreshHud() {
  $('score').textContent = state.progress.intersections.size;
  const total = state.graph.edges.size;
  let found = 0;
  for (const id of state.graph.edges.keys()) if (state.progress.edges.has(id)) found++;
  let interDone = 0;
  for (const n of state.graph.intersections) {
    if (state.progress.intersections.has(n.key)) interDone++;
  }
  $('stat-edges').textContent = `${found}/${total}`;
  $('stat-inter').textContent = `${interDone}/${state.graph.intersections.length}`;
}

let toastTimer = null;
function toast(msg, ms = 3500) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

// ---------------------------------------------------------------- complétion

function nearBoundary(node) {
  return haversine([node.lat, node.lon], state.center) > RADIUS - BOUNDARY_MARGIN;
}

// Vérifie une intersection : toutes ses arêtes incidentes sont-elles dans
// l'historique ? Retourne true si elle vient d'être complétée.
function checkIntersection(node) {
  if (state.progress.intersections.has(node.key)) return false;
  if (nearBoundary(node)) return false;
  if (!node.edgeIds.every((id) => state.progress.edges.has(id))) return false;
  state.progress.intersections.add(node.key);
  repaintIntersection(node.key);
  return true;
}

// Passe globale (au chargement) : attribue les complétions déjà acquises.
function sweepCompletions(announce) {
  let gained = 0;
  for (const n of state.graph.intersections) {
    if (checkIntersection(n)) gained++;
  }
  if (gained > 0) {
    storage.save(state.progress);
    if (announce) toast(`+${gained} intersection(s) complétée(s) !`);
  }
  return gained;
}

// ---------------------------------------------------------------- session

$('btn-session').addEventListener('click', () => {
  state.session ? endSession() : startSession();
});

$('btn-center').addEventListener('click', () => {
  if (state.posMarker) state.map.panTo(state.posMarker.getLatLng());
  else state.map.panTo(state.center);
});

function startSession() {
  state.matcher = new Matcher(state.graph, state.proj);
  state.session = {
    newEdges: new Set(),
    newInter: new Set(),
    trackLine: L.polyline([], { color: COLORS.track, weight: 3, opacity: 0.6, dashArray: '4 6' }).addTo(state.map),
    startedAt: Date.now(),
  };
  const btn = $('btn-session');
  btn.textContent = 'Terminer la session';
  btn.classList.add('recording');
  toast('Session démarrée — bonne exploration !');

  state.watchId = navigator.geolocation.watchPosition(
    (pos) => onFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
    (err) => toast('GPS : ' + err.message),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
}

function onFix(lat, lon, accuracy) {
  updatePosition(lat, lon, accuracy);
  if (!state.session) return;
  state.session.trackLine.addLatLng([lat, lon]);

  for (const edgeId of state.matcher.feed(lat, lon, accuracy)) {
    if (state.progress.edges.has(edgeId)) continue; // déjà dans l'historique
    state.progress.edges.add(edgeId);
    state.session.newEdges.add(edgeId);
    repaintEdge(edgeId);

    // Intersections touchées par cette nouvelle arête.
    const e = state.graph.edges.get(edgeId);
    for (const key of [e.a, e.b]) {
      const node = state.graph.nodes.get(key);
      if (node && node.edgeIds.length >= 3 && checkIntersection(node)) {
        state.session.newInter.add(key);
        toast('Intersection complétée ! +1 point 🎉');
      }
    }
    storage.save(state.progress); // sauvegarde continue : rien n'est perdu si l'app est tuée
    refreshHud();
  }
}

function updatePosition(lat, lon, accuracy) {
  if (!state.posMarker) {
    state.posMarker = L.circleMarker([lat, lon], {
      radius: 7, color: '#fff', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 1,
    }).addTo(state.map);
    state.accCircle = L.circle([lat, lon], {
      radius: accuracy || 0, color: '#3b82f6', weight: 1, opacity: 0.3, fillOpacity: 0.08,
    }).addTo(state.map);
    state.map.panTo([lat, lon]);
  } else {
    state.posMarker.setLatLng([lat, lon]);
    state.accCircle.setLatLng([lat, lon]).setRadius(accuracy || 0);
  }
}

function endSession() {
  if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;

  const { newEdges, newInter, trackLine, startedAt } = state.session;
  state.session = null;
  state.matcher = null;
  trackLine.remove();

  storage.save(state.progress);
  refreshHud();

  const mins = Math.round((Date.now() - startedAt) / 60000);
  toast(
    `Session terminée (${mins} min) : ${newEdges.size} nouveau(x) tronçon(s), ` +
    `${newInter.size} intersection(s) complétée(s).`,
    6000
  );

  const btn = $('btn-session');
  btn.textContent = 'Démarrer une session';
  btn.classList.remove('recording');
}

// ---------------------------------------------------------------- PWA & debug

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Hooks de debug (console / tests) : window.__walkedia.feedFix(lat, lon, acc)
window.__walkedia = {
  state,
  init,
  feedFix: (lat, lon, acc = 5) => onFix(lat, lon, acc),
};
