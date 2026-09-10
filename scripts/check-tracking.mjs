// Vérifie les règles de jeu de la spécification qui vivent côté client :
// détection de passage (C2), anti-jitter (C3), journal (C4), consécutivité
// stricte (D1) et désambiguïsation multi-candidats (D3).
//
// Sur un graphe SYNTHÉTIQUE, sans réseau ni Overpass : ce qui est testé ici,
// ce sont des règles, pas des données OSM. La construction du graphe réel,
// elle, est vérifiée de bout en bout par check-region-contract.mjs.
//
// Usage (Node 22+) :
//   node --experimental-strip-types scripts/check-tracking.mjs

import { PointTracker, POINT_REACH_RADIUS, POINT_RELEASE_RADIUS } from '../mobile/src/logic/tracking.ts';
import { choisirTroncon, indexerParPaire, frechetDiscret } from '../mobile/src/logic/troncons.ts';
import { makeProj, lineLength } from '../mobile/src/logic/geo.js';

let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`);
  if (!ok) failures++;
};

// ------------------------------------------------------------------ décor

const LAT0 = 48.8;
const LON0 = 2.3;
const KY = 110540;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const proj = makeProj(LAT0);

// Coordonnées en mètres depuis (LAT0, LON0), pour écrire le décor à la main.
const pt = (x, y) => [LAT0 + y / KY, LON0 + x / KX];

const A = pt(0, 0);
const B = pt(100, 0);
const C = pt(200, 0);
const D = pt(0, 200);
const E = pt(100, 200);

const troncon = (id, ja, jb, coords) => [id, { id, ja, jb, coords, length: lineLength(coords) }];

// A—B par deux chemins (cas B1) : une boucle nord bien marquée (donc plus
// longue) et une boucle sud discrète (donc la plus courte des deux).
// A—C direct : le piège de D1, un tronçon qui ne doit JAMAIS être validé par
// un trajet A → B → C.
// D—E deux fois : deux tracés quasi identiques, à 1 m l'un de l'autre —
// personne ne peut les départager, c'est le cas « marge insuffisante ».
const edges = new Map([
  troncon('AB-nord', 'A', 'B', [A, pt(50, 25), B]),
  troncon('AB-sud', 'A', 'B', [A, pt(50, -10), B]),
  troncon('BC', 'B', 'C', [B, C]),
  troncon('AC-direct', 'A', 'C', [A, pt(100, -80), C]),
  troncon('DE-gauche', 'D', 'E', [D, pt(50, 201), E]),
  troncon('DE-droite', 'D', 'E', [D, pt(50, 199.5), E]),
]);

const junction = (id, c) => [id, { id, lat: c[0], lon: c[1], members: [id], branchEdgeIds: new Set() }];
const junctions = new Map([junction('A', A), junction('B', B), junction('C', C), junction('D', D), junction('E', E)]);

const graph = { nodes: new Map(), edges, junctions };
const index = indexerParPaire(graph);

// ---------------------------------------------------- C2 / C3 : passage et hystérésis

console.log('\n=== C2/C3 — détection de passage et anti-jitter ===');
{
  const tracker = new PointTracker(graph, proj);
  const loin = pt(60, 0); // à 40 m de A comme de B : hors de tout

  check(tracker.feed(loin[0], loin[1], 5).length === 0, 'aucun point atteint loin de tout');

  const tresPres = pt(3, 0); // 3 m de A, sous le seuil d'entrée (5 m)
  check(tracker.feed(tresPres[0], tresPres[1], 5).join() === 'A', `A atteint à moins de ${POINT_REACH_RADIUS} m`);

  const zoneGrise = pt(6.5, 0); // entre 5 et 8 m : la spécification dit « rien ne change »
  check(tracker.feed(zoneGrise[0], zoneGrise[1], 5).length === 0, 'pas de nouveau déclenchement entre 5 et 8 m');
  check(tracker.dansPortee.has('A'), "l'état « atteint » n'est pas perdu entre 5 et 8 m");

  check(tracker.feed(tresPres[0], tresPres[1], 5).length === 0, 'revenir sous 5 m sans être ressorti ne redéclenche pas');

  const sorti = pt(12, 0); // au-delà de 8 m : l'état se relâche
  tracker.feed(sorti[0], sorti[1], 5);
  check(!tracker.dansPortee.has('A'), `état relâché au-delà de ${POINT_RELEASE_RADIUS} m`);
  check(tracker.feed(tresPres[0], tresPres[1], 5).join() === 'A', 'A redéclenche après être ressorti (retraversée)');

  // Un fix imprécis pourrait « atteindre » un point situé à 30 m : ignoré.
  const tracker2 = new PointTracker(graph, proj);
  check(tracker2.feed(tresPres[0], tresPres[1], 120).length === 0, 'fix trop imprécis ignoré');
}

// ------------------------------------------------- D1 : consécutivité stricte

// Rejoue une marche le long d'une polyligne, exactement comme la boucle GPS du
// hook : ré-échantillonnage tous les 5 m pour la détection, sous-trace BRUTE
// (ici un point tous les 10 m, comme un fix GPS de marche) pour D3.
function marcher(chemin, { pasFix = 10 } = {}) {
  const tracker = new PointTracker(graph, proj);
  const journal = [];
  const valides = [];
  let dernier = null;
  let sousTrace = [];

  const fixes = reechantillonner(chemin, pasFix);
  let precedent = null;
  for (const fix of fixes) {
    sousTrace.push(fix);
    for (const p of interpoler(precedent, fix, 5)) {
      for (const pointId of tracker.feed(p[0], p[1], 5)) {
        if (dernier && dernier !== pointId) {
          const choix = choisirTroncon(index, dernier, pointId, sousTrace.map((c) => proj(c[0], c[1])), proj);
          if (choix) valides.push({ id: choix.edge.id, methode: choix.methode });
        }
        dernier = pointId;
        sousTrace = [fix];
        if (!journal.includes(pointId)) journal.push(pointId);
      }
    }
    precedent = fix;
  }
  return { journal, valides };
}

function reechantillonner(coords, pas) {
  const out = [];
  let reste = 0;
  for (let i = 1; i < coords.length; i++) {
    const [a, b] = [coords[i - 1], coords[i]];
    const len = Math.hypot((b[1] - a[1]) * KX, (b[0] - a[0]) * KY);
    for (let d = reste; d < len; d += pas) {
      const f = d / len;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      reste = d + pas - len;
    }
  }
  out.push(coords[coords.length - 1]);
  return out;
}

function interpoler(prev, cur, pas) {
  if (!prev) return [cur];
  const dist = Math.hypot((cur[1] - prev[1]) * KX, (cur[0] - prev[0]) * KY);
  if (dist <= pas) return [cur];
  const n = Math.round(dist / pas);
  const out = [];
  for (let i = 1; i < n; i++) {
    const f = i / n;
    out.push([prev[0] + (cur[0] - prev[0]) * f, prev[1] + (cur[1] - prev[1]) * f]);
  }
  out.push(cur);
  return out;
}

console.log('\n=== D1 — consécutivité stricte ===');
{
  // A → B (par le nord) → C. Le tronçon A-C existe dans le graphe : il ne doit
  // pas être validé, puisque B a été franchi entre les deux.
  const { journal, valides } = marcher([A, pt(50, 25), B, C]);
  const ids = valides.map((v) => v.id);
  check(journal.join('>') === 'A>B>C', `journal chronologique : ${journal.join(' > ')}`);
  check(ids.includes('AB-nord'), `A-B validé (${ids.join(', ')})`);
  check(ids.includes('BC'), 'B-C validé');
  check(!ids.includes('AC-direct'), 'A-C JAMAIS validé alors que B a été franchi');
}

{
  // Aller-retour A → B → A → C : le journal dédoublonné (C4) met B et C côte à
  // côte, alors que le joueur est repassé par A entre les deux. Rien ne doit
  // valider un tronçon B-C fantôme — ici B-C existe, c'est le piège exact.
  const { journal, valides } = marcher([A, pt(50, -10), B, pt(50, -10), A, pt(100, -80), C]);
  const ids = valides.map((v) => v.id);
  check(journal.join('>') === 'A>B>C', `journal dédoublonné : ${journal.join(' > ')} (B et C voisins dans la liste)`);
  check(ids.filter((id) => id === 'BC').length === 0, 'aucun B-C validé sur un aller-retour par A');
  check(ids.includes('AC-direct'), 'A-C validé, lui, car parcouru pour de vrai');
}

// ------------------------------------------------- D3 : plusieurs candidats

console.log('\n=== D3 — désambiguïsation multi-candidats ===');
{
  const sousTraceNord = reechantillonner([A, pt(50, 25), B], 10).map((c) => proj(c[0], c[1]));
  const nord = choisirTroncon(index, 'A', 'B', sousTraceNord, proj);
  check(nord.edge.id === 'AB-nord' && nord.methode === 'frechet', `boucle nord marchée -> ${nord.edge.id} (${nord.methode})`);

  const sousTraceSud = reechantillonner([A, pt(50, -10), B], 10).map((c) => proj(c[0], c[1]));
  const sud = choisirTroncon(index, 'A', 'B', sousTraceSud, proj);
  check(sud.edge.id === 'AB-sud' && sud.methode === 'frechet', `boucle sud marchée -> ${sud.edge.id} (${sud.methode})`);

  // Moins de 3 points GPS : pas de Fréchet du tout, on prend le plus court.
  const pauvre = choisirTroncon(index, 'A', 'B', [proj(A[0], A[1]), proj(B[0], B[1])], proj);
  check(
    pauvre.methode === 'trace-pauvre' && pauvre.edge.id === 'AB-sud',
    `trace de 2 points -> plus court sans calcul (${pauvre.edge.id})`
  );

  // Deux tracés à 1 m l'un de l'autre : la marge de 20 % ne peut pas être
  // atteinte, donc fallback sur le plus court.
  const traceDE = reechantillonner([D, pt(50, 200), E], 10).map((c) => proj(c[0], c[1]));
  const ambigu = choisirTroncon(index, 'D', 'E', traceDE, proj);
  const plusCourtDE = edges.get('DE-gauche').length < edges.get('DE-droite').length ? 'DE-gauche' : 'DE-droite';
  check(ambigu.methode === 'ambigu', `deux tracés confondus -> marge insuffisante (${ambigu.methode})`);
  check(ambigu.edge.id === plusCourtDE, `fallback sur le plus court (${ambigu.edge.id})`);

  // Aucun tronçon entre A et E : rien ne doit être inventé.
  check(choisirTroncon(index, 'A', 'E', traceDE, proj) === null, 'aucun candidat -> rien de validé');
}

console.log('\n=== Distance de Fréchet ===');
{
  const ligne = [
    [0, 0],
    [10, 0],
    [20, 0],
  ];
  check(frechetDiscret(ligne, ligne) === 0, 'deux polylignes identiques : distance nulle');
  const decalee = ligne.map(([x, y]) => [x, y + 3]);
  check(Math.abs(frechetDiscret(ligne, decalee) - 3) < 1e-9, 'décalage constant de 3 m : distance 3');
  // Fréchet retient le PIRE écart, pas la moyenne : un seul point qui s'écarte
  // suffit à faire monter le score, c'est ce qui distingue deux branches.
  const bosse = [
    [0, 0],
    [10, 12],
    [20, 0],
  ];
  check(frechetDiscret(ligne, bosse) >= 12 - 1e-9, 'un écart ponctuel de 12 m se voit entièrement');
}

console.log(failures ? `\n${failures} vérification(s) en échec` : '\nToutes les vérifications passent.');
process.exit(failures ? 1 : 0);
