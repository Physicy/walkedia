// Assigne chaque carrefour au quartier OSM (place=suburb/neighbourhood/
// quarter) dont le contour le contient, même pattern que la classification
// espace vert dans graph.js (bbox rapide puis point-dans-polygone).
// Un carrefour hors de tout contour connu (fréquent : la plupart des villes
// ne cartographient pas leurs quartiers en polygone) reste sans quartier.

import { pointInPolygon, ringBBox } from './geo.js';

export function assignNeighborhoods(junctions, neighborhoods) {
  const polys = [...neighborhoods.values()].map((n) => ({ n, bbox: ringBBox(n.ring) }));
  const result = new Map(); // junctionId -> neighborhoodId | null

  for (const j of junctions.values()) {
    let found = null;
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
