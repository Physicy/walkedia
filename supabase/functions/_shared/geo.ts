// Copie synchronisée de mobile/src/logic/geo.js — aucune dépendance RN,
// tourne tel quel côté Deno (Edge Function). Ne pas diverger sans reporter
// le changement des deux côtés (voir plan : contrat de données backend↔client).

const EARTH_R = 6371000;

export function haversine(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

export function lineLength(coords: [number, number][]): number {
  let len = 0;
  for (let i = 1; i < coords.length; i++) len += haversine(coords[i - 1], coords[i]);
  return len;
}

// Point situé à la fraction f (0..1) de la longueur totale de la polyligne.
export function pointAtFraction(coords: [number, number][], f: number): [number, number] {
  const total = lineLength(coords);
  let target = total * f;
  for (let i = 1; i < coords.length; i++) {
    const seg = haversine(coords[i - 1], coords[i]);
    if (target <= seg || i === coords.length - 1) {
      const t = seg > 0 ? Math.min(1, target / seg) : 0;
      return [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
      ];
    }
    target -= seg;
  }
  return coords[coords.length - 1];
}

// Rectangle englobant d'un anneau [[lat,lon], ...] (filtre rapide avant
// pointInPolygon, qui est plus coûteux).
export function ringBBox(ring: [number, number][]) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lat, lon] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

// Point-dans-polygone par ray casting, directement en lat/lon (suffisant à
// l'échelle d'un quartier). `ring` : [[lat,lon], ...], implicitement fermé
// (l'arête entre le dernier et le premier point est prise en compte).
export function pointInPolygon([lat, lon]: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lonI] = ring[i];
    const [latJ, lonJ] = ring[j];
    const crosses = lonI > lon !== lonJ > lon;
    if (crosses && lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI) {
      inside = !inside;
    }
  }
  return inside;
}

// Projection locale lat/lon -> [x, y] en mètres.
export function makeProj(lat0: number) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  return (lat: number, lon: number): [number, number] => [lon * kx, lat * ky];
}
