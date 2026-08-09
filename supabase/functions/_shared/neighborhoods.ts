// Assigne chaque carrefour au quartier OSM dont le contour le contient
// (bbox rapide puis
// point-dans-polygone). Un carrefour hors de tout contour connu (fréquent)
// reste sans quartier.

import { pointInPolygon, ringBBox } from './geo.ts';
import type { Neighborhood } from './overpass.ts';

export function assignNeighborhoods(junctions: Map<string, any>, neighborhoods: Map<number, Neighborhood>) {
  const polys = [...neighborhoods.values()].map((n) => ({ n, bbox: ringBBox(n.ring) }));
  const result = new Map<string, number | null>();

  for (const j of junctions.values()) {
    let found: number | null = null;
    for (const { n, bbox } of polys) {
      if (j.lat < bbox.minLat || j.lat > bbox.maxLat || j.lon < bbox.minLon || j.lon > bbox.maxLon) continue;
      if (pointInPolygon([j.lat, j.lon], n.ring)) {
        found = n.id;
        break;
      }
    }
    result.set(j.id, found);
  }
  return result;
}
