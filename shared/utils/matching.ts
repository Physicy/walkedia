import { projectOnPolyline, type ProjectionResult } from './geo.js';
import type { Graph, Edge } from '../types/index.js';

const CELL = 120;
const MAX_DIST = 30;
export const MAX_ACCURACY = 40;

interface GridKey extends String {}
interface CoverageMap extends Map<string, { min: number; max: number }> {}

export class Matcher {
  private proj: (lat: number, lon: number) => [number, number];
  private cover: CoverageMap;
  private traversed: Set<string>;
  private edges: Map<string, Edge>;
  private xy: Map<string, [number, number][]>;
  private grid: Map<GridKey, Edge[]>;

  constructor(
    graph: Graph,
    proj: (lat: number, lon: number) => [number, number],
    prev?: Matcher
  ) {
    this.proj = proj;
    this.cover = prev ? new Map(prev.cover) : new Map();
    this.traversed = prev ? new Set(prev.traversed) : new Set();
    this.edges = graph.edges;
    this.xy = new Map();
    this.grid = new Map();

    for (const e of graph.edges.values()) {
      const xy = e.coords.map((c) => proj(c[0], c[1]));
      this.xy.set(e.id, xy);
      const cells = new Set<GridKey>();
      for (let i = 1; i < xy.length; i++) {
        const minX = Math.min(xy[i - 1][0], xy[i][0]) - MAX_DIST;
        const maxX = Math.max(xy[i - 1][0], xy[i][0]) + MAX_DIST;
        const minY = Math.min(xy[i - 1][1], xy[i][1]) - MAX_DIST;
        const maxY = Math.max(xy[i - 1][1], xy[i][1]) + MAX_DIST;
        for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
          for (let cy = Math.floor(minY / CELL); cy <= Math.floor(maxY / CELL); cy++) {
            cells.add((cx + ':' + cy) as GridKey);
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

  feed(lat: number, lon: number, accuracy?: number): string[] {
    if (accuracy != null && accuracy > MAX_ACCURACY) return [];
    const [x, y] = this.proj(lat, lon);
    const key = (Math.floor(x / CELL) + ':' + Math.floor(y / CELL)) as GridKey;
    const candidates = this.grid.get(key) || [];

    let best: { edge: Edge; dist: number; t: number } | null = null;
    for (const e of candidates) {
      const r = projectOnPolyline([x, y], this.xy.get(e.id)!);
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
    const needed = len <= 40 ? len * 0.5 : Math.min(len * 0.75, len - 30);

    if (covered >= needed && !this.traversed.has(best.edge.id)) {
      this.traversed.add(best.edge.id);
      return [best.edge.id];
    }
    return [];
  }

  getTraversed(): Set<string> {
    return this.traversed;
  }

  getCoverage(): CoverageMap {
    return this.cover;
  }
}
