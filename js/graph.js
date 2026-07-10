// Construction du graphe routier à partir des données OSM brutes :
//  1. repérage des nœuds de jonction (partagés par plusieurs ways),
//  2. découpage des ways en segments entre jonctions,
//  3. fusion des chaînes de degré 2 pour que chaque arête relie deux
//     "vrais" nœuds du graphe (intersections ou impasses),
//  4. attribution d'identifiants d'arêtes stables, dérivés de la géométrie
//     (indépendants des IDs OSM, qui peuvent changer),
//  5. détection des carrefours : degré calculé sur les branches
//     significatives (les impasses courtes ne comptent pas), puis
//     consolidation des nœuds trop proches en un seul carrefour — OSM
//     fragmente un carrefour réel en 4 à 8 nœuds (trottoirs, passages
//     piétons, chaussées séparées).
//
// En environnement urbain (densité locale de voirie carrossable élevée),
// seuls les carrefours du réseau routier accessible en voiture comptent :
// les maillages de parcs, places et trottoirs ne génèrent plus de points.
// En environnement rural, les sentiers et chemins SONT le réseau principal,
// donc toutes les voies piétonnes comptent (règle d'origine).

import { lineLength, pointAtFraction, haversine } from './geo.js';

const STUB_MAX = 30;    // impasse plus courte que ça -> branche non significative (m)
const LINK_MAX = 25;    // arête plus courte entre deux carrefours -> fusion (m)
const CLUSTER_MAX = 60; // diagonale maximale d'un carrefour consolidé (m)

// Voies "principales" accessibles en voiture (service, track, chemins exclus).
const CAR_HIGHWAYS = new Set([
  'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
]);
const DENSITY_CELL = 250;    // taille des cellules de la grille de densité (m)
const URBAN_MIN_ROAD = 2200; // urbain si >= ce total de voirie carrossable (m)
                             // dans la fenêtre 3x3 autour du nœud (750 m de côté)

export function nodeKey(c) {
  return c[0].toFixed(6) + ',' + c[1].toFixed(6);
}

function coordKey5(c) {
  return c[0].toFixed(5) + ',' + c[1].toFixed(5);
}

// ID stable : extrémités triées + point milieu géométrique + longueur arrondie.
// Le milieu distingue deux arêtes parallèles reliant les mêmes extrémités.
function edgeId(coords, length) {
  const a = coordKey5(coords[0]);
  const b = coordKey5(coords[coords.length - 1]);
  const mid = coordKey5(pointAtFraction(coords, 0.5));
  const ends = a < b ? a + '|' + b : b + '|' + a;
  return ends + '|' + mid + '|' + Math.round(length);
}

export function buildGraph(osm) {
  // 0. Paires de nœuds consécutifs appartenant à une voie carrossable :
  //    permet de retrouver, après découpage/fusion, la part carrossable
  //    de chaque arête finale.
  const pairKey = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
  const carPairs = new Set();
  for (const w of osm.ways) {
    if (!CAR_HIGHWAYS.has(w.tags.highway)) continue;
    for (let i = 1; i < w.nodes.length; i++) carPairs.add(pairKey(w.nodes[i - 1], w.nodes[i]));
  }

  // 1. Un nœud est une jonction s'il apparaît au moins 2 fois (dans plusieurs
  //    ways, ou deux fois dans un way fermé).
  const usage = new Map();
  for (const w of osm.ways) {
    for (const nid of w.nodes) usage.set(nid, (usage.get(nid) || 0) + 1);
  }
  const isJunction = (nid) => (usage.get(nid) || 0) >= 2;

  // 2. Découpage des ways aux jonctions.
  const all = [];
  for (const w of osm.ways) {
    let start = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      if (i === w.nodes.length - 1 || isJunction(w.nodes[i])) {
        all.push({ nodes: w.nodes.slice(start, i + 1), dead: false });
        start = i;
      }
    }
  }

  // 3. Fusion des nœuds de degré 2 (artefacts de découpage OSM).
  const adj = new Map();
  const addAdj = (nid, seg) => {
    let list = adj.get(nid);
    if (!list) adj.set(nid, (list = []));
    list.push(seg);
  };
  for (const s of all) {
    addAdj(s.nodes[0], s);
    addAdj(s.nodes[s.nodes.length - 1], s);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [nid, list] of adj) {
      const live = list.filter((s) => !s.dead);
      adj.set(nid, live);
      if (live.length !== 2 || live[0] === live[1]) continue;
      const [s1, s2] = live;
      let n1 = s1.nodes.slice();
      let n2 = s2.nodes.slice();
      if (n1[0] === nid) n1.reverse();
      if (n2[n2.length - 1] === nid) n2.reverse();
      if (n1[n1.length - 1] !== nid || n2[0] !== nid) continue;
      const merged = { nodes: n1.concat(n2.slice(1)), dead: false };
      s1.dead = true;
      s2.dead = true;
      adj.set(nid, []);
      all.push(merged);
      addAdj(merged.nodes[0], merged);
      addAdj(merged.nodes[merged.nodes.length - 1], merged);
      changed = true;
    }
  }

  // 4. Structures finales : arêtes et nœuds.
  const edges = new Map(); // id -> { id, coords, length, a, b }
  const nodes = new Map(); // key -> { key, lat, lon, edgeIds }
  for (const s of all) {
    if (s.dead) continue;
    const coords = s.nodes.map((nid) => osm.nodes.get(nid)).filter(Boolean);
    if (coords.length < 2) continue;
    const length = lineLength(coords);
    if (length < 1) continue;
    const id = edgeId(coords, length);
    if (edges.has(id)) continue;
    let carLen = 0;
    for (let i = 1; i < s.nodes.length; i++) {
      if (!carPairs.has(pairKey(s.nodes[i - 1], s.nodes[i]))) continue;
      const ca = osm.nodes.get(s.nodes[i - 1]);
      const cb = osm.nodes.get(s.nodes[i]);
      if (ca && cb) carLen += haversine(ca, cb);
    }
    const e = {
      id,
      coords,
      length,
      car: carLen / length >= 0.5,
      a: nodeKey(coords[0]),
      b: nodeKey(coords[coords.length - 1]),
    };
    edges.set(id, e);
    for (const [key, c] of [[e.a, coords[0]], [e.b, coords[coords.length - 1]]]) {
      let n = nodes.get(key);
      if (!n) nodes.set(key, (n = { key, lat: c[0], lon: c[1], edgeIds: [] }));
      n.edgeIds.push(id);
    }
  }

  // 5a. Classification urbain/rural : densité locale de voirie carrossable,
  //     accumulée dans une grille de cellules de 250 m (fenêtre 3x3 lissée).
  let lat0 = 0;
  let count = 0;
  for (const n of nodes.values()) {
    lat0 += n.lat;
    if (++count >= 50) break;
  }
  lat0 = count ? lat0 / count : 0;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const cellKey = (lat, lon) =>
    Math.floor((lon * kx) / DENSITY_CELL) + ':' + Math.floor((lat * ky) / DENSITY_CELL);
  const density = new Map();
  for (const e of edges.values()) {
    if (!e.car) continue;
    for (let i = 1; i < e.coords.length; i++) {
      const mid = [(e.coords[i - 1][0] + e.coords[i][0]) / 2, (e.coords[i - 1][1] + e.coords[i][1]) / 2];
      const k = cellKey(mid[0], mid[1]);
      density.set(k, (density.get(k) || 0) + haversine(e.coords[i - 1], e.coords[i]));
    }
  }
  const isUrban = (lat, lon) => {
    const cx = Math.floor((lon * kx) / DENSITY_CELL);
    const cy = Math.floor((lat * ky) / DENSITY_CELL);
    let sum = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) sum += density.get(cx + dx + ':' + (cy + dy)) || 0;
    }
    return sum >= URBAN_MIN_ROAD;
  };

  // 5b. Branches significatives : une impasse courte (entrée de bâtiment,
  //     allée de garage) ne compte ni dans le degré, ni dans la complétion.
  //     En zone urbaine, seules les branches carrossables comptent.
  const isStubFor = (e, key) => {
    const other = e.a === key ? e.b : e.a;
    if (other === key) return e.length < STUB_MAX; // boucle courte sur le nœud
    return e.length < STUB_MAX && nodes.get(other).edgeIds.length === 1;
  };

  const candidates = new Set(); // nœuds avec >= 3 branches significatives
  const urbanNode = new Map();  // key -> bool (mode retenu pour ce nœud)
  for (const n of nodes.values()) {
    const urban = isUrban(n.lat, n.lon);
    const pool = urban ? n.edgeIds.filter((id) => edges.get(id).car) : n.edgeIds;
    const sig = pool.filter((id) => !isStubFor(edges.get(id), n.key));
    if (sig.length >= 3) {
      candidates.add(n.key);
      urbanNode.set(n.key, urban);
    }
  }

  // 5c. Consolidation : union-find des candidats reliés par une arête courte,
  //     avec plafond de taille pour ne pas avaler un maillage de place entière.
  const parent = new Map();
  const bbox = new Map();
  for (const key of candidates) {
    parent.set(key, key);
    const n = nodes.get(key);
    bbox.set(key, { minLat: n.lat, maxLat: n.lat, minLon: n.lon, maxLon: n.lon });
  }
  const find = (k) => {
    while (parent.get(k) !== k) {
      parent.set(k, parent.get(parent.get(k)));
      k = parent.get(k);
    }
    return k;
  };

  for (const e of edges.values()) {
    if (e.length >= LINK_MAX) continue;
    if (!candidates.has(e.a) || !candidates.has(e.b) || e.a === e.b) continue;
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) continue;
    const A = bbox.get(ra);
    const B = bbox.get(rb);
    const m = {
      minLat: Math.min(A.minLat, B.minLat),
      maxLat: Math.max(A.maxLat, B.maxLat),
      minLon: Math.min(A.minLon, B.minLon),
      maxLon: Math.max(A.maxLon, B.maxLon),
    };
    if (haversine([m.minLat, m.minLon], [m.maxLat, m.maxLon]) > CLUSTER_MAX) continue;
    parent.set(ra, rb);
    bbox.set(rb, m);
  }

  const clusters = new Map(); // racine -> [keys]
  for (const key of candidates) {
    const r = find(key);
    let list = clusters.get(r);
    if (!list) clusters.set(r, (list = []));
    list.push(key);
  }

  // 5d. Carrefours consolidés : complétés quand toutes les branches EXTERNES
  //     significatives ont été parcourues. Les micro-arêtes internes au
  //     carrefour (passages piétons, traversées) ne sont pas exigées.
  //     Un groupe est urbain dès qu'un de ses membres l'est : seules ses
  //     branches carrossables sont alors exigées.
  const junctions = new Map();     // id -> { id, lat, lon, members, requiredEdgeIds }
  const edgeJunctions = new Map(); // edgeId -> [junctionId]
  for (const members of clusters.values()) {
    const memberSet = new Set(members);
    const urban = members.some((key) => urbanNode.get(key));
    const required = new Set();
    for (const key of members) {
      for (const id of nodes.get(key).edgeIds) {
        const e = edges.get(id);
        if (urban && !e.car) continue;
        if (memberSet.has(e.a) && memberSet.has(e.b)) continue; // interne
        if (isStubFor(e, key)) continue;
        required.add(id);
      }
    }
    if (required.size < 3) continue; // pas un vrai carrefour

    members.sort();
    const id = members[0]; // clé stable : plus petit nœud membre
    let lat = 0;
    let lon = 0;
    for (const key of members) {
      const n = nodes.get(key);
      lat += n.lat;
      lon += n.lon;
    }
    const j = {
      id,
      lat: lat / members.length,
      lon: lon / members.length,
      members,
      requiredEdgeIds: required,
    };
    junctions.set(id, j);
    for (const eid of required) {
      let list = edgeJunctions.get(eid);
      if (!list) edgeJunctions.set(eid, (list = []));
      list.push(id);
    }
  }

  return { nodes, edges, junctions, edgeJunctions };
}
