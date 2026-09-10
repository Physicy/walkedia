// Validation des tronçons — section 4 de la spécification
// (docs/spec-points-troncons-gps.md).
//
// D1 (consécutivité stricte) : un tronçon N↔N' n'est validé que si N et N'
// ont été atteints l'un APRÈS l'autre dans la même session, sans aucun autre
// point d'intersection franchi entre les deux. Un trajet N → M → N' valide
// N-M et M-N', jamais N-N' — même si un tronçon direct existe.
//
// D2 : pas d'accumulation d'une session à l'autre. Atteindre N un jour et N'
// un autre jour ne valide rien. (Les POINTS, eux, restent acquis
// définitivement — c'est la règle de non-perte de progression.)
//
// D3 (désambiguïsation) : plusieurs tronçons peuvent relier les deux mêmes
// points sans passer par un tiers (B1 : les deux branches d'une boucle, les
// deux côtés d'un rond-point). On compare alors la sous-trace GPS brute
// enregistrée entre les deux passages à la géométrie OSM de chaque candidat.

import type { Edge, Graph } from './regionGraph';

// D3, paramètres validés par la spécification (§6).
export const MIN_GPS_POINTS_FRECHET = 3; // en dessous, pas de Fréchet du tout
export const MARGE_DESAMBIGUISATION = 1.2; // le meilleur score doit devancer le
                                           // deuxième d'au moins 20 %

// ------------------------------------------------------------- distance de Fréchet
//
// Fréchet plutôt qu'une simple somme de distances point-à-ligne : la question
// posée est « quel tracé le promeneur a-t-il suivi », pas « de quel tracé
// est-il resté le plus proche en moyenne ». Deux branches de boucle qui se
// rejoignent donnent des moyennes voisines mais des Fréchet très différentes,
// parce que Fréchet retient le PIRE écart le long d'un appariement qui
// respecte l'ordre de parcours — exactement la propriété qui distingue « j'ai
// pris la branche nord » de « j'ai pris la branche sud ».
//
// Variante discrète (sommets contre sommets) plutôt que continue : c'est
// l'algorithme classique en O(n·m) sur deux tableaux, sans géométrie
// analytique, et l'échantillonnage GPS (un point par seconde ou tous les
// quelques mètres) est bien plus fin que l'écart qu'on cherche à mesurer.
//
// Gardée dans ce fichier plutôt que dans un module à part : ces deux modules
// de logique doivent rester exécutables tels quels par `node
// --experimental-strip-types` (voir scripts/check-tracking.mjs), ce qui
// interdit les imports sans extension entre eux.

// Au-delà, on sous-échantillonne : le produit n·m est le coût, et une
// sous-trace de session normale fait quelques dizaines de points. Ce plafond
// n'existe que pour qu'une trace anormalement longue (import d'une marche
// d'une heure sans point d'intersection rencontré) ne fige pas le thread JS.
const MAX_POINTS = 300;

function sousEchantillonner(pts: [number, number][]): [number, number][] {
  if (pts.length <= MAX_POINTS) return pts;
  const pas = pts.length / MAX_POINTS;
  const out: [number, number][] = [];
  for (let i = 0; i < MAX_POINTS; i++) out.push(pts[Math.floor(i * pas)]);
  out[out.length - 1] = pts[pts.length - 1]; // les extrémités comptent double dans Fréchet
  return out;
}

export function frechetDiscret(a: [number, number][], b: [number, number][]): number {
  const p = sousEchantillonner(a);
  const q = sousEchantillonner(b);
  if (!p.length || !q.length) return Infinity;

  const d = (i: number, j: number) => Math.hypot(p[i][0] - q[j][0], p[i][1] - q[j][1]);

  // Une seule ligne du tableau à la fois : `ligne[j]` est le couplage optimal
  // entre p[0..i] et q[0..j].
  let ligne = new Array<number>(q.length);
  let precedente = new Array<number>(q.length);

  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      const direct = d(i, j);
      if (i === 0 && j === 0) ligne[j] = direct;
      else if (i === 0) ligne[j] = Math.max(ligne[j - 1], direct);
      else if (j === 0) ligne[j] = Math.max(precedente[j], direct);
      else ligne[j] = Math.max(Math.min(precedente[j], precedente[j - 1], ligne[j - 1]), direct);
    }
    const tmp = precedente;
    precedente = ligne;
    ligne = tmp;
  }

  return precedente[q.length - 1];
}

// ------------------------------------------------------------- choix du tronçon

export type MethodeChoix =
  | 'unique'        // un seul candidat : rien à départager
  | 'frechet'       // écart suffisant entre le meilleur et le deuxième
  | 'trace-pauvre'  // moins de MIN_GPS_POINTS_FRECHET points GPS
  | 'ambigu';       // Fréchet calculée, mais marge insuffisante

export interface Choix {
  edge: Edge;
  methode: MethodeChoix;
  candidats: number;
}

// Clé symétrique d'une paire de points : le tronçon N↔N' n'a pas de sens de
// parcours, et le joueur peut l'emprunter dans les deux sens.
export function clePaire(a: string, b: string): string {
  return a < b ? a + '|' + b : b + '|' + a;
}

// Index paire de points -> tronçons candidats (B1 : il peut y en avoir
// plusieurs). Reconstruit à chaque fusion de zone, comme le tracker de points.
export function indexerParPaire(graph: Graph | null): Map<string, Edge[]> {
  const index = new Map<string, Edge[]>();
  for (const e of graph?.edges.values() || []) {
    if (!e.ja || !e.jb) continue;
    const key = clePaire(e.ja, e.jb);
    let list = index.get(key);
    if (!list) index.set(key, (list = []));
    list.push(e);
  }
  // Ordre stable (par identifiant) : sans ça, deux appareils qui ont chargé
  // leurs zones dans un ordre différent pourraient départager différemment un
  // ex aequo parfait.
  for (const list of index.values()) list.sort((a, b) => (a.id < b.id ? -1 : 1));
  return index;
}

function plusCourt(candidats: Edge[]): Edge {
  return candidats.reduce((meilleur, e) => (e.length < meilleur.length ? e : meilleur));
}

// Applique D3 à une paire de points consécutifs. `sousTrace` est la trace GPS
// BRUTE (pas interpolée, pas lissée) enregistrée entre le passage au premier
// point et le passage au second, déjà projetée en mètres.
// Retourne `null` quand aucun tronçon du graphe ne relie ces deux points :
// c'est le cas normal quand le joueur a coupé par un chemin non cartographié,
// ou quand un point intermédiaire n'a pas été détecté.
export function choisirTroncon(
  index: Map<string, Edge[]>,
  pointA: string,
  pointB: string,
  sousTrace: [number, number][],
  proj: (lat: number, lon: number) => number[]
): Choix | null {
  const projeter = (coords: [number, number][]): [number, number][] =>
    coords.map((c) => {
      const p = proj(c[0], c[1]);
      return [p[0], p[1]];
    });
  const candidats = index.get(clePaire(pointA, pointB));
  if (!candidats || !candidats.length) return null;
  if (candidats.length === 1) return { edge: candidats[0], methode: 'unique', candidats: 1 };

  // Trace trop pauvre pour conclure quoi que ce soit (passage très rapide,
  // fixes GPS espacés) : fallback direct, sans calcul.
  if (sousTrace.length < MIN_GPS_POINTS_FRECHET) {
    return { edge: plusCourt(candidats), methode: 'trace-pauvre', candidats: candidats.length };
  }

  const scores = candidats
    .map((edge) => ({
      edge,
      score: frechetDiscret(sousTrace, projeter(edge.coords)),
    }))
    .sort((a, b) => a.score - b.score);

  const [meilleur, second] = scores;
  if (second.score >= MARGE_DESAMBIGUISATION * meilleur.score) {
    return { edge: meilleur.edge, methode: 'frechet', candidats: candidats.length };
  }
  // Marge insuffisante : les deux tracés collent autant l'un que l'autre à ce
  // que le GPS a vu. On ne tranche pas au hasard, on prend le plus court —
  // fallback explicite de la spécification.
  return { edge: plusCourt(candidats), methode: 'ambigu', candidats: candidats.length };
}
