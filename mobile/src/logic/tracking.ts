// Suivi GPS pendant une session — section 3 de la spécification
// (docs/spec-points-troncons-gps.md).
//
// Remplace l'ancien map matching par couverture d'arête (`matching.js`, où un
// tronçon était crédité quand les projections GPS couvraient assez de sa
// longueur). Ce que la spécification demande est plus simple et plus net :
//   C2 — un point d'intersection est ATTEINT dès que la position passe à moins
//        de POINT_REACH_RADIUS de ses coordonnées ;
//   C3 — pour ne pas clignoter quand le signal oscille autour du seuil, l'état
//        « atteint » ne se relâche qu'au-delà de POINT_RELEASE_RADIUS ; entre
//        les deux, rien ne change (ni nouveau déclenchement, ni perte).
// Les tronçons, eux, ne sont plus déduits de la trace : ils se déduisent de
// l'ORDRE des points atteints (voir troncons.ts, règles D1 à D3).

import type { Graph } from './regionGraph';

// Précision GPS minimale acceptée (m) : au-delà, le fix est ignoré — il
// pourrait « atteindre » un point situé à 30 m.
export const MAX_ACCURACY = 40;

export const POINT_REACH_RADIUS = 5;   // C2 — validé par la spécification
export const POINT_RELEASE_RADIUS = 8; // C3 — validé par la spécification

const CELL = 40; // taille de cellule de l'index en grille (m) — > au rayon de
                 // relâchement, donc un voisinage 3x3 suffit à tout voir

export class PointTracker {
  proj: (lat: number, lon: number) => number[];
  points: Map<string, { id: string; xy: [number, number] }>;
  grid: Map<string, string[]>;
  // Points actuellement dans l'état « atteint » (hystérésis C3). Conservé
  // d'un `prev` à l'autre : étendre la zone en pleine marche ne doit pas
  // re-déclencher le point sur lequel on est posé.
  dansPortee: Set<string>;

  // `prev` : tracker de la même session avant extension de zone. Les points
  // ont des identifiants stables, l'état d'hystérésis les suit.
  constructor(graph: Graph | null, proj: (lat: number, lon: number) => number[], prev: PointTracker | null = null) {
    this.proj = proj;
    this.dansPortee = prev ? prev.dansPortee : new Set();
    this.points = new Map();
    this.grid = new Map();

    for (const j of graph?.junctions.values() || []) {
      const [x, y] = proj(j.lat, j.lon);
      this.points.set(j.id, { id: j.id, xy: [x, y] });
      const key = Math.floor(x / CELL) + ':' + Math.floor(y / CELL);
      let list = this.grid.get(key);
      if (!list) this.grid.set(key, (list = []));
      list.push(j.id);
    }

    // Un point sorti du graphe (zone jamais rechargée) n'a plus de coordonnées
    // à comparer : le garder dans l'état « atteint » le figerait à jamais.
    for (const id of [...this.dansPortee]) {
      if (!this.points.has(id)) this.dansPortee.delete(id);
    }
  }

  // Traite une position GPS. Retourne les points nouvellement atteints, du
  // plus proche au plus lointain — plusieurs points peuvent tomber sous le
  // seuil d'un même fix là où OSM fragmente une jonction (A2 ne consolide
  // qu'à 5 m).
  feed(lat: number, lon: number, accuracy: number | null): string[] {
    if (accuracy != null && accuracy > MAX_ACCURACY) return [];
    const [x, y] = this.proj(lat, lon);

    // C3, sortie d'hystérésis : au-delà de POINT_RELEASE_RADIUS, le point
    // redevient déclenchable. Balayer l'ensemble « en portée » plutôt que la
    // grille autour de la position : un point quitté d'un seul bond GPS
    // resterait sinon bloqué dans l'état atteint.
    for (const id of [...this.dansPortee]) {
      const p = this.points.get(id)!;
      if (Math.hypot(p.xy[0] - x, p.xy[1] - y) > POINT_RELEASE_RADIUS) this.dansPortee.delete(id);
    }

    // C2, entrée : rayon de détection strict autour de la position.
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const atteints: { id: string; dist: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const id of this.grid.get(cx + dx + ':' + (cy + dy)) || []) {
          if (this.dansPortee.has(id)) continue;
          const p = this.points.get(id)!;
          const dist = Math.hypot(p.xy[0] - x, p.xy[1] - y);
          if (dist < POINT_REACH_RADIUS) atteints.push({ id, dist });
        }
      }
    }

    atteints.sort((a, b) => a.dist - b.dist);
    for (const { id } of atteints) this.dansPortee.add(id);
    return atteints.map((a) => a.id);
  }
}
