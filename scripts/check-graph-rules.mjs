// Vérifie les règles de construction du graphe (sections 1 et 2 de la
// spécification) sur des scènes OSM SYNTHÉTIQUES, écrites à la main : A1
// (vraie jonction), A2 (consolidation à 5 m), A3 (régime urbain / parc), A4
// (impasse courte), B0/B1 (tronçons et candidats multiples).
//
// Complémentaire de check-region-contract.mjs, qui vérifie la même
// construction sur de VRAIES données mais dépend d'Overpass (lent, et souvent
// en panne). Ici : aucun réseau, un résultat déterministe, et chaque règle
// isolée dans sa propre scène.
//
// Usage (Node 22+) :
//   node --experimental-strip-types scripts/check-graph-rules.mjs

import { buildGraph, DEAD_END_MAX_LENGTH_M, NODE_MERGE_RADIUS_M } from '../supabase/functions/_shared/graph.ts';

let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`);
  if (!ok) failures++;
};

// Décor en mètres autour d'un point de référence, converti en lat/lon.
const LAT0 = 47.5;
const LON0 = 0.5;
const KY = 110540;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const pt = (x, y) => [LAT0 + y / KY, LON0 + x / KX];

const ROUTE = { highway: 'residential' };
const CHEMIN = { highway: 'footway' };
const RUE_PIETONNE = { highway: 'pedestrian' };

function scene() {
  const nodes = new Map();
  const ways = [];
  let prochain = 1;
  return {
    osm: { nodes, ways },
    // Crée un nœud aux coordonnées données et retourne son identifiant.
    n(x, y) {
      const id = prochain++;
      nodes.set(id, pt(x, y));
      return id;
    },
    // Une way OSM à partir d'identifiants de nœuds (réutiliser un id = partager
    // le nœud, donc créer une jonction).
    w(tags, ...ids) {
      ways.push({ id: 1000 + ways.length, nodes: ids, tags });
    },
  };
}

// Contour fermé couvrant toute la scène.
const CONTOUR = [pt(-500, -500), pt(500, -500), pt(500, 500), pt(-500, 500)];

const pointPres = (graph, x, y, tol = 12) => {
  const [lat, lon] = pt(x, y);
  for (const p of graph.junctions.values()) {
    const dx = (p.lon - lon) * KX;
    const dy = (p.lat - lat) * KY;
    if (Math.hypot(dx, dy) <= tol) return p;
  }
  return null;
};

// Deux carrefours reliés par un axe, chacun avec trois branches : le décor
// minimal où un tronçon existe (B0 exige un point à chaque bout).
// `brancheCourte` sert à tester A4 : longueur de l'antenne nord du carrefour
// ouest.
function deuxCarrefours({ tags = ROUTE, brancheCourte = 80 } = {}) {
  const s = scene();
  const ouest = s.n(0, 0);
  const est = s.n(160, 0);
  s.w(tags, s.n(-120, 0), ouest);
  s.w(tags, ouest, est);
  s.w(tags, est, s.n(280, 0));
  s.w(tags, ouest, s.n(0, brancheCourte));
  s.w(tags, est, s.n(160, 80));
  return s;
}

console.log('\n=== A1 — un point est une vraie jonction ===');
{
  const s = deuxCarrefours();
  // Un vertex de pure géométrie (nœud traversé par une seule way) au milieu
  // de l'axe : il dessine une courbure, il ne doit rien générer.
  s.osm.ways[1].nodes = [s.osm.ways[1].nodes[0], s.n(80, 20), s.osm.ways[1].nodes[1]];
  const g = await buildGraph(s.osm);

  check(g.junctions.size === 2, `deux jonctions à trois branches -> deux points (${g.junctions.size})`);
  check(pointPres(g, 80, 20) === null, 'le vertex de courbure ne génère aucun point');
  check(g.edges.size === 1, `un seul tronçon entre les deux points (${g.edges.size})`);

  const t = [...g.edges.values()][0];
  check(
    t.coords.length === 3,
    `le tronçon garde la géométrie OSM, courbure comprise (${t.coords.length} sommets)`
  );
  const [p1, p2] = [...g.junctions.values()];
  check(
    (t.ja === p1.id && t.jb === p2.id) || (t.ja === p2.id && t.jb === p1.id),
    'le tronçon porte ses deux points (ja/jb)'
  );
  check(
    p1.branchEdgeIds.has(t.id) && p2.branchEdgeIds.has(t.id),
    'le tronçon est branche de ses deux extrémités'
  );
}

console.log('\n=== A4 — impasse courte ===');
{
  const courte = await buildGraph(deuxCarrefours({ brancheCourte: DEAD_END_MAX_LENGTH_M - 10 }).osm);
  check(
    courte.junctions.size === 0,
    `antenne de ${DEAD_END_MAX_LENGTH_M - 10} m : le carrefour ouest retombe à deux branches, ` +
      `plus de tronçon possible (${courte.junctions.size} point(s))`
  );

  const longue = await buildGraph(deuxCarrefours({ brancheCourte: DEAD_END_MAX_LENGTH_M + 10 }).osm);
  check(longue.junctions.size === 2, `antenne de ${DEAD_END_MAX_LENGTH_M + 10} m : le carrefour compte bien`);
}

console.log('\n=== A2 — consolidation des nœuds fragmentés ===');
for (const ecart of [NODE_MERGE_RADIUS_M - 2, NODE_MERGE_RADIUS_M + 7]) {
  // Deux jonctions distantes de `ecart`, chacune à trois branches : le cas
  // d'une voie et d'un chemin piéton taggés séparément. Un troisième
  // carrefour à l'est donne au groupe un tronçon vers lequel exister — sans
  // lui, aucune branche ne mènerait nulle part et le point serait écarté.
  const s = scene();
  const a = s.n(0, 0);
  const b = s.n(ecart, 0);
  const est = s.n(300, 0);
  s.w(ROUTE, s.n(-120, 0), a);
  s.w(ROUTE, a, b);
  s.w(ROUTE, a, s.n(0, 80));
  s.w(ROUTE, b, s.n(ecart, -80));
  s.w(ROUTE, b, est);
  s.w(ROUTE, est, s.n(420, 0));
  s.w(ROUTE, est, s.n(300, 80));
  const g = await buildGraph(s.osm);

  if (ecart < NODE_MERGE_RADIUS_M) {
    check(g.junctions.size === 2, `${ecart} m : les deux nœuds n'en font qu'un (${g.junctions.size} points au total)`);
    const p = pointPres(g, ecart / 2, 0);
    check(p?.members.length === 2, `${ecart} m : les deux nœuds OSM sont ses membres`);
    const dx = p ? (p.lon - pt(ecart / 2, 0)[1]) * KX : Infinity;
    check(Math.abs(dx) < 0.01, `${ecart} m : le point est au barycentre du groupe`);
    check(g.edges.size === 1, `${ecart} m : un seul tronçon, vers le carrefour est (${g.edges.size})`);
  } else {
    check(g.junctions.size === 3, `${ecart} m : deux points distincts, plus le carrefour est (${g.junctions.size})`);
    const lien = [...g.edges.values()].find((e) => Math.round(e.length) === ecart);
    check(!!lien, `${ecart} m : le lien entre les deux devient un tronçon à part entière`);
  }
}

console.log('\n=== B1 — plusieurs tronçons entre les deux mêmes points ===');
{
  const s = scene();
  const p = s.n(0, 0);
  const q = s.n(200, 0);
  s.w(ROUTE, p, s.n(100, 40), q); // branche nord
  s.w(ROUTE, p, s.n(100, -40), q); // branche sud
  s.w(ROUTE, s.n(-120, 0), p); // troisième branche de P
  s.w(ROUTE, q, s.n(320, 0)); // troisième branche de Q
  const g = await buildGraph(s.osm);

  check(g.junctions.size === 2, `deux points (${g.junctions.size})`);
  const entrePQ = [...g.edges.values()].filter(
    (e) => (e.ja !== e.jb) && new Set([e.ja, e.jb]).size === 2
  );
  check(entrePQ.length === 2, `les deux branches coexistent comme tronçons distincts (${entrePQ.length})`);
  check(new Set(entrePQ.map((e) => e.id)).size === 2, 'leurs identifiants diffèrent (le point milieu les sépare)');
  const [pa, pb] = [...g.junctions.values()];
  check(pa.branchEdgeIds.size === 2 && pb.branchEdgeIds.size === 2, 'chaque point liste ses deux branches');
}

console.log('\n=== Impasse : jamais un tronçon (B0) ===');
{
  const s = deuxCarrefours();
  const g = await buildGraph(s.osm);
  // Les branches extérieures (-120 m à l'ouest, +120 m à l'est, les antennes
  // nord) mènent à des nœuds de degré 1 : aucune ne doit être un tronçon.
  check(g.edges.size === 1, `seul l'axe entre les deux points est un tronçon (${g.edges.size})`);
}

console.log('\n=== A3 — régime urbain, parc, rural ===');
{
  const chemins = () => deuxCarrefours({ tags: CHEMIN }).osm;

  const rural = await buildGraph(chemins());
  check(rural.junctions.size === 2, `rural : les carrefours de chemins comptent (${rural.junctions.size})`);

  const urbain = await buildGraph(chemins(), [], [CONTOUR]);
  check(urbain.junctions.size === 0, `urbain : un maillage de chemins ne génère aucun point (${urbain.junctions.size})`);

  const parc = await buildGraph(chemins(), [CONTOUR], [CONTOUR]);
  check(parc.junctions.size === 2, `parc dans une zone urbaine : toutes les branches comptent (${parc.junctions.size})`);

  const rue = await buildGraph(deuxCarrefours({ tags: RUE_PIETONNE }).osm, [], [CONTOUR]);
  check(rue.junctions.size === 2, `urbain : une rue piétonne est une voie principale (${rue.junctions.size})`);

  const voiture = await buildGraph(deuxCarrefours().osm, [], [CONTOUR]);
  check(voiture.junctions.size === 2, `urbain : une rue carrossable compte (${voiture.junctions.size})`);
}

console.log(failures ? `\n${failures} vérification(s) en échec` : '\nToutes les vérifications passent.');
process.exit(failures ? 1 : 0);
