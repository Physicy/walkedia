// Construction du graphe routier à partir des données OSM brutes :
//  1. repérage des nœuds de jonction (partagés par plusieurs ways),
//  2. découpage des ways en segments entre jonctions,
//  3. fusion des chaînes de degré 2 pour que chaque arête relie deux
//     "vrais" nœuds du graphe (intersections ou impasses),
//  4. attribution d'identifiants d'arêtes stables, dérivés de la géométrie
//     (indépendants des IDs OSM, qui peuvent changer).

import { lineLength, pointAtFraction } from './geo.js';

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

  // 4. Structures finales.
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
    const e = {
      id,
      coords,
      length,
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

  // Intersection <=> degré >= 3 (une boucle sur un nœud compte pour 2).
  const intersections = [...nodes.values()].filter((n) => n.edgeIds.length >= 3);

  return { nodes, edges, intersections };
}
