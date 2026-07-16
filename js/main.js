import { fetchNetwork } from './overpass.js';
import { buildGraph } from './graph.js';
import { Matcher } from './matching.js';
import { makeProj, haversine } from './geo.js';
import * as storage from './storage.js';

const RADIUS = 800;           // rayon de chargement du graphe (m)
const BOUNDARY_MARGIN = 100;  // marge : ne pas évaluer les carrefours trop
                              // proches du bord (arêtes incidentes non chargées)
const EXPAND_MARGIN = 300;    // à moins de 300 m du bord de la zone connue,
                              // on télécharge une nouvelle zone autour de soi
const EXPAND_COOLDOWN = 30000; // délai minimal entre deux tentatives (ms)

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
  center: null,  // [lat, lon] du premier chargement
  centers: [],   // centres de toutes les zones chargées
  osmRaw: { nodes: new Map(), ways: new Map() }, // données OSM brutes cumulées
  expanding: false,
  lastExpandTry: 0,
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

let initializing = false;

async function init(lat, lon) {
  if (initializing || state.map) return; // double clic / double appel
  initializing = true;
  setStartStatus('Chargement du réseau piéton…');
  let osm;
  try {
    osm = await fetchNetwork(lat, lon, RADIUS);
  } catch (err) {
    setStartStatus('Impossible de charger les données OSM : ' + err.message);
    initializing = false;
    return;
  }

  state.center = [lat, lon];
  state.proj = makeProj(lat);
  mergeOsm(osm);
  state.centers.push([lat, lon]);

  state.map = L.map('map', { preferCanvas: true, zoomControl: false }).setView([lat, lon], 16);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.map);

  rebuildGraph();
  // Les complétions se recalculent depuis l'historique d'arêtes : des arêtes
  // déjà découvertes peuvent compléter des carrefours de cette zone.
  sweepCompletions(false);
  refreshHud();

  $('start-screen').classList.add('hidden');
  $('btn-session').hidden = false;
  $('btn-center').hidden = false;
  $('tabbar').hidden = false;
  toast(`${state.graph.edges.size} tronçons · ${state.graph.junctions.size} carrefours dans la zone`);
}

// ------------------------------------------------- zones & reconstruction

function mergeOsm(osm) {
  for (const [id, c] of osm.nodes) state.osmRaw.nodes.set(id, c);
  for (const w of osm.ways) state.osmRaw.ways.set(w.id, w);
}

// Reconstruit le graphe complet depuis les données OSM cumulées et redessine.
function rebuildGraph() {
  state.graph = buildGraph({
    nodes: state.osmRaw.nodes,
    ways: [...state.osmRaw.ways.values()],
  });
  for (const l of state.edgeLayers.values()) l.remove();
  for (const l of state.interLayers.values()) l.remove();
  state.edgeLayers.clear();
  state.interLayers.clear();
  renderGraph();
}

function distToNearestCenter(lat, lon) {
  let best = Infinity;
  for (const c of state.centers) best = Math.min(best, haversine([lat, lon], c));
  return best;
}

// Étend la zone connue quand le joueur s'approche du bord (appelé à chaque
// position GPS pendant une session).
async function maybeExpand(lat, lon) {
  const now = Date.now();
  if (state.expanding || now - state.lastExpandTry < EXPAND_COOLDOWN) return;
  if (distToNearestCenter(lat, lon) <= RADIUS - EXPAND_MARGIN) return;
  state.expanding = true;
  state.lastExpandTry = now;
  try {
    const osm = await fetchNetwork(lat, lon, RADIUS);
    mergeOsm(osm);
    state.centers.push([lat, lon]);
    rebuildGraph();
    if (state.matcher) state.matcher = new Matcher(state.graph, state.proj, state.matcher);
    sweepCompletions(false);
    refreshHud();
    toast('Nouvelle zone chargée 🗺️');
  } catch (err) {
    // Réessaiera au prochain fix après le délai de refroidissement.
    toast('Extension de zone impossible : ' + err.message);
  } finally {
    state.expanding = false;
  }
}

// ---------------------------------------------------------------- rendu

function renderGraph() {
  for (const e of state.graph.edges.values()) {
    const line = L.polyline(e.coords, styleForEdge(e.id)).addTo(state.map);
    state.edgeLayers.set(e.id, line);
  }
  for (const j of state.graph.junctions.values()) {
    const marker = L.circleMarker([j.lat, j.lon], styleForJunction(j.id)).addTo(state.map);
    marker.bindTooltip(() => {
      let done = 0;
      for (const id of j.requiredEdgeIds) if (state.progress.edges.has(id)) done++;
      return `${done}/${j.requiredEdgeIds.size} branches parcourues`;
    });
    state.interLayers.set(j.id, marker);
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

function styleForJunction(id) {
  const done = state.progress.junctions.has(id);
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

function repaintJunction(id) {
  const layer = state.interLayers.get(id);
  if (layer) layer.setStyle(styleForJunction(id));
}

function refreshHud() {
  $('score').textContent = state.progress.junctions.size;
  const total = state.graph.edges.size;
  let found = 0;
  for (const id of state.graph.edges.keys()) if (state.progress.edges.has(id)) found++;
  let done = 0;
  for (const id of state.graph.junctions.keys()) {
    if (state.progress.junctions.has(id)) done++;
  }
  $('stat-edges').textContent = `${found}/${total}`;
  $('stat-inter').textContent = `${done}/${state.graph.junctions.size}`;
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

function nearBoundary(j) {
  return distToNearestCenter(j.lat, j.lon) > RADIUS - BOUNDARY_MARGIN;
}

// Vérifie un carrefour : toutes ses branches externes significatives
// sont-elles dans l'historique ? Retourne true s'il vient d'être complété.
function checkJunction(j) {
  if (state.progress.junctions.has(j.id)) return false;
  if (nearBoundary(j)) return false;
  for (const id of j.requiredEdgeIds) {
    if (!state.progress.edges.has(id)) return false;
  }
  state.progress.junctions.add(j.id);
  state.progress.completedAt[j.id] = Date.now();
  repaintJunction(j.id);
  return true;
}

// Passe globale (au chargement) : attribue les complétions déjà acquises et
// retire les complétions orphelines de la zone (un ID de carrefour est un
// "lat,lon" : si le point est dans la zone chargée mais que le carrefour
// n'existe plus, la définition a changé — il sera re-complété depuis
// l'historique d'arêtes s'il a un successeur).
function sweepCompletions(announce) {
  let pruned = 0;
  for (const id of [...state.progress.junctions]) {
    if (state.graph.junctions.has(id)) continue;
    const [lat, lon] = id.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (distToNearestCenter(lat, lon) > RADIUS - BOUNDARY_MARGIN) continue;
    state.progress.junctions.delete(id);
    delete state.progress.completedAt[id];
    pruned++;
  }
  let gained = 0;
  for (const j of state.graph.junctions.values()) {
    if (checkJunction(j)) gained++;
  }
  if (gained > 0 || pruned > 0) {
    storage.save(state.progress);
    if (announce && gained > 0) toast(`+${gained} carrefour(s) complété(s) !`);
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
  maybeExpand(lat, lon); // asynchrone, sans bloquer le suivi

  for (const edgeId of state.matcher.feed(lat, lon, accuracy)) {
    if (state.progress.edges.has(edgeId)) continue; // déjà dans l'historique
    state.progress.edges.add(edgeId);
    state.progress.edgeMeters += state.graph.edges.get(edgeId).length;
    state.session.newEdges.add(edgeId);
    repaintEdge(edgeId);

    // Carrefours dont cette nouvelle arête est une branche requise.
    for (const jid of state.graph.edgeJunctions.get(edgeId) || []) {
      const j = state.graph.junctions.get(jid);
      if (j && checkJunction(j)) {
        state.session.newInter.add(jid);
        toast('Carrefour complété ! +1 point 🎉');
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

  state.progress.sessions.push({
    start: startedAt,
    end: Date.now(),
    edges: newEdges.size,
    junctions: newInter.size,
  });
  storage.save(state.progress);
  refreshHud();

  const mins = Math.round((Date.now() - startedAt) / 60000);
  toast(
    `Session terminée (${mins} min) : ${newEdges.size} nouveau(x) tronçon(s), ` +
    `${newInter.size} carrefour(s) complété(s).`,
    6000
  );

  const btn = $('btn-session');
  btn.textContent = 'Démarrer une session';
  btn.classList.remove('recording');
}

// ---------------------------------------------------------------- profil

const DAY = 86400000;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function pointsSince(t) {
  let n = 0;
  for (const at of Object.values(state.progress.completedAt)) if (at >= t) n++;
  return n;
}

function pointsBetween(a, b) {
  let n = 0;
  for (const at of Object.values(state.progress.completedAt)) if (at >= a && at < b) n++;
  return n;
}

function renderProfile() {
  const p = state.progress;
  const today = startOfToday();
  const monday = today - ((new Date().getDay() + 6) % 7) * DAY;
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  $('p-total').textContent = p.junctions.size;
  $('p-today').textContent = pointsSince(today);
  $('p-week').textContent = pointsSince(monday);
  $('p-month').textContent = pointsSince(firstOfMonth);
  $('p-edges').textContent = p.edges.size;
  $('p-km').textContent = (p.edgeMeters / 1000).toFixed(1);
  $('p-sessions').textContent = p.sessions.length;

  // Graphique : points par jour sur les 7 derniers jours.
  const days = [];
  let max = 0;
  const dayName = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
  for (let i = 6; i >= 0; i--) {
    const start = today - i * DAY;
    const pts = pointsBetween(start, start + DAY);
    max = Math.max(max, pts);
    days.push({ label: dayName.format(new Date(start)).replace('.', ''), pts });
  }
  $('p-chart').innerHTML = days
    .map((d) => {
      const h = max > 0 ? Math.max(6, Math.round((d.pts / max) * 52)) : 6;
      return `<div class="bar${d.pts === 0 ? ' zero' : ''}">` +
        `<b>${d.pts || ''}</b><i style="height:${h}px"></i><label>${d.label}</label></div>`;
    })
    .join('');

  // Dernières sessions.
  const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
  const recent = p.sessions.slice(-5).reverse();
  $('p-session-list').innerHTML = recent.length
    ? recent
        .map((s) => {
          const mins = Math.max(1, Math.round((s.end - s.start) / 60000));
          return `<li><span>${dateFmt.format(new Date(s.start))}</span>` +
            `<span>${mins} min</span><span>${s.edges} tronçon(s)</span>` +
            `<span class="pts">+${s.junctions} pt(s)</span></li>`;
        })
        .join('')
    : '<li class="empty">Aucune session pour l’instant</li>';

  // Points acquis avant l'ajout du suivi temporel (sans date).
  const untracked = p.junctions.size - Object.keys(p.completedAt).length;
  $('p-untracked').hidden = untracked <= 0;
  if (untracked > 0) {
    $('p-untracked').textContent =
      `${untracked} point(s) acquis avant le suivi temporel : comptés dans le total uniquement.`;
  }
}

// ---------------------------------------------------------------- onglets

function switchTab(name) {
  $('view-search').hidden = name !== 'search';
  $('view-profile').hidden = name !== 'profile';
  if (name === 'profile') renderProfile();
  for (const btn of document.querySelectorAll('#tabbar button')) {
    btn.classList.toggle('active', btn.dataset.tab === name);
  }
}

for (const btn of document.querySelectorAll('#tabbar button')) {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
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
