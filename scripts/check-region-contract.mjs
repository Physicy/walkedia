// Vérifie le contrat get-region <-> client de bout en bout, avec le vrai code
// des deux côtés :
//   serveur    : _shared/graph.ts buildGraph -> serialize.ts clipGraph + serializeGraph
//   transport  : JSON.stringify / JSON.parse
//   client     : regionGraph.ts deserializeRegion + mergeGraph
//
// Le client fusionne des graphes construits séparément sans jamais
// reconstruire : ce script contrôle que le résultat reste celui d'un graphe
// construit d'un seul tenant (ce que faisait le client avant la bascule).
// C'est la propriété qui casse en silence si on touche à buildGraph, à la
// découpe (clipGraph) ou aux rayons BUILD_RADIUS/SERVE_RADIUS.
//
// Usage (Node 22+, --experimental-strip-types pour importer les .ts) :
//   node --experimental-strip-types scripts/check-region-contract.mjs
// Le premier passage interroge Overpass (lent) ; les suivants lisent le cache
// disque de scripts/osm-cache.mjs.

import { fetchZone, snapToGrid, offsetCenter, RADIUS } from './osm-cache.mjs';
import { buildGraph } from '../supabase/functions/_shared/graph.ts';
import { clipGraph, serializeGraph } from '../supabase/functions/_shared/serialize.ts';
import { deserializeRegion, emptyGraph, mergeGraph } from '../mobile/src/logic/regionGraph.ts';
import { haversine, pointAtFraction } from '../mobile/src/logic/geo.js';

// Doivent refléter get-region/index.ts et useWalkedia.ts.
const BUILD_RADIUS = 1000;
const SERVE_RADIUS = 550;
const BOUNDARY_MARGIN = 60;

let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`);
  if (!ok) failures++;
};

// Tolérance : un élément isolé, ou 0,5 %. La marge de construction ne rend pas
// les deux modèles rigoureusement identiques — il reste des cas limites (la
// classification urbain/rural d'un carrefour de bord se calcule sur une
// fenêtre de densité différente). L'ordre de grandeur visé est « indiscernable
// du bruit des éditions OSM quotidiennes », pas l'égalité stricte.
const tolerable = (n, total) => n <= 1 || n / total <= 0.005;

async function run(label, lat0, lon0) {
  console.log(`\n=== ${label} ===`);

  // Quatre zones adjacentes sur la grille de centres, comme un joueur qui
  // marche ou déplace la carte en ferait charger.
  const centers = [
    snapToGrid(lat0, lon0, RADIUS),
    offsetCenter(lat0, lon0, RADIUS, 0),
    offsetCenter(lat0, lon0, 0, RADIUS),
    offsetCenter(lat0, lon0, RADIUS, RADIUS),
  ];

  // --- ce que fait l'Edge Function, zone par zone
  const payloads = [];
  for (const center of centers) {
    const z = await fetchZone(center[0], center[1], BUILD_RADIUS);
    const full = await buildGraph(z.osm, z.greenAreas.map((a) => a.ring));
    payloads.push(
      JSON.stringify({
        graph: serializeGraph(clipGraph(full, center, SERVE_RADIUS)),
        neighborhoods: [],
        junctionNeighborhood: [],
        center,
        radius: RADIUS,
      })
    );
  }

  // --- ce que fait le client
  const merged = emptyGraph();
  for (const raw of payloads) mergeGraph(merged, deserializeRegion(JSON.parse(raw)).graph);

  // --- référence : un seul graphe construit sur l'union des données brutes
  const nodes = new Map();
  const waysById = new Map();
  const greenById = new Map();
  for (const center of centers) {
    const z = await fetchZone(center[0], center[1], RADIUS);
    for (const [id, c] of z.osm.nodes) nodes.set(id, c);
    for (const w of z.osm.ways) waysById.set(w.id, w);
    for (const a of z.greenAreas) greenById.set(a.id, a);
  }
  const ref = await buildGraph({ nodes, ways: [...waysById.values()] }, [...greenById.values()].map((a) => a.ring));

  // --- cohérence interne : aucune référence pendante dans le graphe fusionné
  let danglingRequired = 0;
  for (const j of merged.junctions.values()) {
    for (const eid of j.requiredEdgeIds) if (!merged.edges.has(eid)) danglingRequired++;
  }
  let danglingNodeEdge = 0;
  for (const n of merged.nodes.values()) {
    for (const eid of n.edgeIds) if (!merged.edges.has(eid)) danglingNodeEdge++;
  }
  let danglingEdgeJunction = 0;
  for (const list of merged.edgeJunctions.values()) {
    for (const jid of list) if (!merged.junctions.has(jid)) danglingEdgeJunction++;
  }
  let missingEndpoints = 0;
  for (const e of merged.edges.values()) {
    if (!merged.nodes.has(e.a) || !merged.nodes.has(e.b)) missingEndpoints++;
  }
  // buildGraph laisse un nœud lister deux fois une arête qui boucle sur lui
  // (e.a === e.b) ; clipGraph doit le dédoublonner, sinon la fusion n'est pas
  // idempotente (elle, elle dédoublonne).
  const dupNodes = [...merged.nodes.values()].filter((n) => new Set(n.edgeIds).size !== n.edgeIds.length).length;

  check(danglingRequired === 0, `aucune branche exigée absente du graphe (${danglingRequired})`);
  check(danglingNodeEdge === 0, `aucune arête inconnue listée sur un nœud (${danglingNodeEdge})`);
  check(danglingEdgeJunction === 0, `aucun carrefour inconnu listé sur une arête (${danglingEdgeJunction})`);
  check(missingEndpoints === 0, `toutes les arêtes ont leurs deux extrémités (${missingEndpoints} sans)`);
  check(dupNodes === 0, `nœuds listant deux fois une arête après fusion : ${dupNodes}`);

  // --- égalité avec la référence, dans la partie jouable (hors garde-fou de bord)
  const interior = (lat, lon) => Math.min(...centers.map((c) => haversine([lat, lon], c))) <= RADIUS - BOUNDARY_MARGIN;
  const edgeInside = (e) => {
    const m = pointAtFraction(e.coords, 0.5);
    return interior(m[0], m[1]);
  };
  const refEdges = new Set([...ref.edges.values()].filter(edgeInside).map((e) => e.id));
  const mergedEdges = new Set([...merged.edges.values()].filter(edgeInside).map((e) => e.id));
  const refJunctions = new Set([...ref.junctions.values()].filter((j) => interior(j.lat, j.lon)).map((j) => j.id));
  const mergedJunctions = new Set([...merged.junctions.values()].filter((j) => interior(j.lat, j.lon)).map((j) => j.id));

  let diffRequired = 0;
  for (const id of refJunctions) {
    if (!mergedJunctions.has(id)) continue;
    const a = [...ref.junctions.get(id).requiredEdgeIds].sort().join('~');
    const b = [...merged.junctions.get(id).requiredEdgeIds].sort().join('~');
    if (a !== b) diffRequired++;
  }

  const missingE = [...refEdges].filter((id) => !mergedEdges.has(id)).length;
  const extraE = [...mergedEdges].filter((id) => !refEdges.has(id)).length;
  const missingJ = [...refJunctions].filter((id) => !mergedJunctions.has(id)).length;
  const extraJ = [...mergedJunctions].filter((id) => !refJunctions.has(id)).length;

  check(tolerable(missingE, refEdges.size), `arêtes manquantes vs référence : ${missingE}/${refEdges.size}`);
  check(tolerable(extraE, refEdges.size), `arêtes en trop vs référence : ${extraE}/${refEdges.size}`);
  check(tolerable(missingJ, refJunctions.size), `carrefours manquants vs référence : ${missingJ}/${refJunctions.size}`);
  check(tolerable(extraJ, refJunctions.size), `carrefours en trop vs référence : ${extraJ}/${refJunctions.size}`);
  check(tolerable(diffRequired, refJunctions.size), `carrefours aux branches exigées différentes : ${diffRequired}/${refJunctions.size}`);

  const bytes = payloads.reduce((sum, p) => sum + p.length, 0);
  console.log(
    `  (payload 4 zones : ${(bytes / 1024 / 1024).toFixed(2)} Mo brut — ` +
      `${merged.edges.size} arêtes / ${merged.junctions.size} carrefours fusionnés)`
  );
}

// La clé de cache, c'est le centre arrondi : tous les points d'une même case
// doivent produire EXACTEMENT le même centre, sinon chaque joueur crée sa
// propre entrée et le cache n'est jamais partagé. Un `kx` dérivé de la
// latitude reçue plutôt que de la latitude arrondie suffit à casser ça (bug
// observé en production : 2.348362 et 2.348386 pour la même case).
function checkGridDeterminism(label, lat0, lon0) {
  console.log(`\n=== Clé de cache — ${label} ===`);
  const [clat, clon] = snapToGrid(lat0, lon0, RADIUS);
  const ky = 110540;
  const kx = 111320 * Math.cos((clat * Math.PI) / 180);
  const keys = new Set();
  // Balayage de l'intérieur de la case (± 40 % de sa taille, pour rester à
  // l'écart des frontières où basculer de case est le comportement voulu).
  for (let dy = -0.4; dy <= 0.4; dy += 0.1) {
    for (let dx = -0.4; dx <= 0.4; dx += 0.1) {
      const [slat, slon] = snapToGrid(clat + (dy * RADIUS) / ky, clon + (dx * RADIUS) / kx, RADIUS);
      keys.add(`${slat.toFixed(6)},${slon.toFixed(6)},${RADIUS}`);
    }
  }
  check(keys.size === 1, `81 points d'une même case donnent une seule clé (${keys.size}) : ${[...keys].join(' ')}`);

  // Ré-arrondir un centre déjà arrondi ne doit rien changer.
  const [rlat, rlon] = snapToGrid(clat, clon, RADIUS);
  check(rlat === clat && rlon === clon, 'arrondir un centre déjà arrondi est neutre');
}

checkGridDeterminism('Paris', 48.8566, 2.348);
checkGridDeterminism('Périurbain', 48.12, -1.6);
checkGridDeterminism('Latitude élevée', 60.17, 24.94);

// Un centre-ville très dense et une zone périurbaine : les deux régimes que
// buildGraph traite différemment (classification urbain/rural).
await run('Paris — Châtelet', 48.8566, 2.348);
await run('Périurbain — Cesson-Sévigné', 48.12, -1.6);

console.log(failures ? `\n${failures} vérification(s) en échec` : '\nToutes les vérifications passent.');
process.exit(failures ? 1 : 0);
