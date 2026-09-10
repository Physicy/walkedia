// Montre ce que la règle A2 (consolidation des nœuds à moins de 5 m) produit
// RÉELLEMENT sur une zone donnée : quels nœuds OSM fusionnent, lesquels
// restent séparés, et ce que changerait un autre rayon.
//
// C'est l'outil des décisions restées ouvertes de la spécification : le rayon
// de fusion (A2) et la longueur d'impasse ignorée (A4) doivent se trancher
// « après tests terrain », donc il faut pouvoir les balayer sur de vrais
// quartiers avant de toucher au code.
//
// Usage (Node 22+) :
//   node --experimental-strip-types scripts/inspect-points.mjs <lat> <lon> [rayon]
//
// Exemple : node --experimental-strip-types scripts/inspect-points.mjs 48.1183 -1.6013
//
// La zone est mise en cache sur disque (scripts/.osm-cache) : relancer avec
// d'autres paramètres ne redemande rien au réseau.

import { fetchZone, snapToGrid, RADIUS } from './osm-cache.mjs';
import { buildGraph, nodeKey, NODE_MERGE_RADIUS_M, DEAD_END_MAX_LENGTH_M } from '../supabase/functions/_shared/graph.ts';
import { haversine } from '../mobile/src/logic/geo.js';

const [, , latArg, lonArg, rayonArg] = process.argv;
if (!latArg || !lonArg) {
  console.error('Usage : node --experimental-strip-types scripts/inspect-points.mjs <lat> <lon> [rayon]');
  process.exit(2);
}
const rayon = Number(rayonArg) || 1000; // même rayon que la construction en production
const [lat, lon] = snapToGrid(Number(latArg), Number(lonArg), RADIUS);

console.log(`Zone : centre ${lat.toFixed(6)}, ${lon.toFixed(6)} — rayon de construction ${rayon} m`);
const zone = await fetchZone(lat, lon, rayon);
console.log(`Instantané OSM : ${zone.snapshot} — ${zone.osm.ways.length} ways, ${zone.osm.nodes.size} nœuds`);
console.log(
  `Contours : ${zone.greenAreas.length} espace(s) vert(s), ${zone.urbanAreas.length} contour(s) landuse urbain`
);

const vert = zone.greenAreas.map((a) => a.ring);
const urbain = zone.urbanAreas.map((a) => a.ring);

// Nom de rue par nœud, reconstruit depuis les tags des ways : le graphe ne
// porte pas les noms (voir mobile/src/logic/junctionInfo.ts), mais pour LIRE un
// diagnostic ils sont indispensables.
const nomsParNoeud = new Map();
for (const w of zone.osm.ways) {
  const nom = w.tags?.name;
  if (!nom) continue;
  for (const nid of w.nodes) {
    const c = zone.osm.nodes.get(nid);
    if (!c) continue;
    const cle = nodeKey(c);
    let set = nomsParNoeud.get(cle);
    if (!set) nomsParNoeud.set(cle, (set = new Set()));
    set.add(nom);
  }
}
const nommer = (membres) => {
  const noms = new Set();
  for (const m of membres) for (const n of nomsParNoeud.get(m) || []) noms.add(n);
  return noms.size ? [...noms].join(' × ') : 'sans nom dans OSM';
};

const dansLeCercle = (p) => haversine([p.lat, p.lon], [lat, lon]) <= RADIUS;
const etendue = (membres) => {
  let max = 0;
  for (let i = 0; i < membres.length; i++) {
    for (let j = i + 1; j < membres.length; j++) {
      const [aLat, aLon] = membres[i].split(',').map(Number);
      const [bLat, bLon] = membres[j].split(',').map(Number);
      max = Math.max(max, haversine([aLat, aLon], [bLat, bLon]));
    }
  }
  return max;
};

// --- la zone telle qu'elle sera réellement servie
const g = await buildGraph(zone.osm, vert, urbain);
const points = [...g.junctions.values()].filter(dansLeCercle);
const fusionnes = points.filter((p) => p.members.length > 1);

console.log(`\n=== Ce que la zone donne aux valeurs de production (A2 = ${NODE_MERGE_RADIUS_M} m, A4 = ${DEAD_END_MAX_LENGTH_M} m) ===`);
console.log(`${points.length} points d'intersection, ${g.edges.size} tronçons (zone de ${RADIUS} m).`);
console.log(
  `${fusionnes.length} point(s) issus d'une consolidation, ` +
    `soit ${((100 * fusionnes.length) / Math.max(1, points.length)).toFixed(1)} % des points.`
);

const parTaille = new Map();
for (const p of points) parTaille.set(p.members.length, (parTaille.get(p.members.length) || 0) + 1);
console.log(
  'Nœuds OSM par point : ' +
    [...parTaille.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([taille, n]) => `${taille} nœud(s) : ${n}`)
      .join(' · ')
);

if (fusionnes.length) {
  console.log('\nLes consolidations les plus larges (ce que la règle des 5 m recolle) :');
  for (const p of fusionnes
    .map((p) => ({ p, e: etendue(p.members) }))
    .sort((a, b) => b.e - a.e)
    .slice(0, 8)) {
    console.log(
      `  ${p.p.members.length} nœuds sur ${p.e.toFixed(1)} m — ${p.p.lat.toFixed(5)},${p.p.lon.toFixed(5)} — ${nommer(p.p.members)}`
    );
  }
}

// --- ce que l'ancienne règle recollait et que celle-ci laisse séparé
const proches = [];
for (let i = 0; i < points.length; i++) {
  for (let j = i + 1; j < points.length; j++) {
    const d = haversine([points[i].lat, points[i].lon], [points[j].lat, points[j].lon]);
    if (d >= NODE_MERGE_RADIUS_M && d <= 25) proches.push({ a: points[i], b: points[j], d });
  }
}
proches.sort((x, y) => x.d - y.d);
console.log(
  `\n=== Points distincts séparés de 5 à 25 m : ${proches.length} paire(s) ===\n` +
    `(l'ancienne règle en fusionnait une partie ; ils comptent maintenant pour deux)`
);
for (const { a, b, d } of proches.slice(0, 10)) {
  console.log(`  ${d.toFixed(1)} m — ${a.lat.toFixed(5)},${a.lon.toFixed(5)} — ${nommer([...a.members, ...b.members])}`);
}

// --- sensibilité : le même quartier construit à d'autres rayons
console.log('\n=== Sensibilité au rayon de fusion (A2) ===');
for (const r of [3, 5, 8, 12, 20, 25]) {
  const gr = await buildGraph(zone.osm, vert, urbain, { nodeMergeRadiusM: r });
  const pts = [...gr.junctions.values()].filter(dansLeCercle);
  const grp = pts.filter((p) => p.members.length > 1).length;
  console.log(
    `  ${String(r).padStart(2)} m : ${String(pts.length).padStart(4)} points ` +
      `(${String(grp).padStart(3)} consolidés), ${String(gr.edges.size).padStart(4)} tronçons` +
      (r === NODE_MERGE_RADIUS_M ? '   <- valeur en production' : '')
  );
}

console.log('\n=== Sensibilité à la longueur d’impasse ignorée (A4) ===');
for (const l of [0, 15, 30, 50, 80]) {
  const gl = await buildGraph(zone.osm, vert, urbain, { deadEndMaxLengthM: l });
  const pts = [...gl.junctions.values()].filter(dansLeCercle);
  console.log(
    `  ${String(l).padStart(2)} m : ${String(pts.length).padStart(4)} points, ${String(gl.edges.size).padStart(4)} tronçons` +
      (l === DEAD_END_MAX_LENGTH_M ? '   <- valeur en production' : '')
  );
}
