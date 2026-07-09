// Map matching simplifié : chaque position GPS est projetée sur l'arête la
// plus proche (index spatial par grille). Une arête est considérée comme
// parcourue quand les projections accumulées couvrent une part suffisante de
// sa longueur — un simple passage à proximité d'un carrefour ne suffit pas.

import { projectOnPolyline } from './geo.js';

const CELL = 120;        // taille de cellule de la grille (m)
const MAX_DIST = 30;     // distance max GPS -> arête (m)
const MAX_ACCURACY = 40; // précision GPS minimale acceptée (m)

export class Matcher {
  constructor(graph, proj) {
    this.proj = proj;
    this.cover = new Map();     // edgeId -> { min, max } (fraction 0..1)
    this.traversed = new Set(); // arêtes validées pendant cette session
    this.edges = graph.edges;
    this.xy = new Map();        // edgeId -> polyligne projetée en mètres
    this.grid = new Map();      // "cx:cy" -> [edge, ...]

    for (const e of graph.edges.values()) {
      const xy = e.coords.map((c) => proj(c[0], c[1]));
      this.xy.set(e.id, xy);
      const cells = new Set();
      for (let i = 1; i < xy.length; i++) {
        const minX = Math.min(xy[i - 1][0], xy[i][0]) - MAX_DIST;
        const maxX = Math.max(xy[i - 1][0], xy[i][0]) + MAX_DIST;
        const minY = Math.min(xy[i - 1][1], xy[i][1]) - MAX_DIST;
        const maxY = Math.max(xy[i - 1][1], xy[i][1]) + MAX_DIST;
        for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
          for (let cy = Math.floor(minY / CELL); cy <= Math.floor(maxY / CELL); cy++) {
            cells.add(cx + ':' + cy);
          }
        }
      }
      for (const key of cells) {
        let list = this.grid.get(key);
        if (!list) this.grid.set(key, (list = []));
        list.push(e);
      }
    }
  }

  // Traite une position GPS. Retourne la liste (0 ou 1) des arêtes
  // nouvellement validées comme parcourues.
  feed(lat, lon, accuracy) {
    if (accuracy != null && accuracy > MAX_ACCURACY) return [];
    const [x, y] = this.proj(lat, lon);
    const key = Math.floor(x / CELL) + ':' + Math.floor(y / CELL);
    const candidates = this.grid.get(key) || [];

    let best = null;
    for (const e of candidates) {
      const r = projectOnPolyline([x, y], this.xy.get(e.id));
      if (r.dist <= MAX_DIST && (!best || r.dist < best.dist)) {
        best = { edge: e, dist: r.dist, t: r.t };
      }
    }
    if (!best) return [];

    let cov = this.cover.get(best.edge.id);
    if (!cov) this.cover.set(best.edge.id, (cov = { min: 1, max: 0 }));
    cov.min = Math.min(cov.min, best.t);
    cov.max = Math.max(cov.max, best.t);

    const len = best.edge.length;
    const covered = Math.max(0, cov.max - cov.min) * len;
    // Arêtes courtes : couvrir la moitié suffit. Arêtes longues : ~75 %,
    // avec 30 m de tolérance aux extrémités (imprécision GPS aux carrefours).
    const needed = len <= 40 ? len * 0.5 : Math.min(len * 0.75, len - 30);

    if (covered >= needed && !this.traversed.has(best.edge.id)) {
      this.traversed.add(best.edge.id);
      return [best.edge.id];
    }
    return [];
  }
}
