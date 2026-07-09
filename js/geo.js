// Utilitaires géométriques. Les calculs de distance se font dans une projection
// équirectangulaire locale (mètres), suffisante à l'échelle d'une ville.

const EARTH_R = 6371000;

export function haversine(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

export function lineLength(coords) {
  let len = 0;
  for (let i = 1; i < coords.length; i++) len += haversine(coords[i - 1], coords[i]);
  return len;
}

// Point situé à la fraction f (0..1) de la longueur totale de la polyligne.
export function pointAtFraction(coords, f) {
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

// Projection locale lat/lon -> [x, y] en mètres.
export function makeProj(lat0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  return (lat, lon) => [lon * kx, lat * ky];
}

// Distance point-segment en coordonnées planes, avec paramètre t sur le segment.
function pointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = 0;
  if (l2 > 0) t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return { dist: Math.hypot(px - cx, py - cy), t };
}

// Projette un point [x,y] sur une polyligne [[x,y],...] déjà projetée.
// Retourne { dist, t } où t est la position (0..1) le long de la longueur totale.
export function projectOnPolyline(pt, xy) {
  let total = 0;
  const segLens = [];
  for (let i = 1; i < xy.length; i++) {
    const l = Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    segLens.push(l);
    total += l;
  }
  if (total === 0) return { dist: Math.hypot(pt[0] - xy[0][0], pt[1] - xy[0][1]), t: 0 };

  let best = null;
  let cum = 0;
  for (let i = 1; i < xy.length; i++) {
    const r = pointToSegment(pt[0], pt[1], xy[i - 1][0], xy[i - 1][1], xy[i][0], xy[i][1]);
    if (!best || r.dist < best.dist) {
      best = { dist: r.dist, t: (cum + r.t * segLens[i - 1]) / total };
    }
    cum += segLens[i - 1];
  }
  return best;
}
