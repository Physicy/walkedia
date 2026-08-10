// Accès Overpass pour les scripts de vérification, avec cache disque
// (scripts/.osm-cache, ignoré par git) : rejouer une vérification ne
// redemande rien au réseau.
//
// Requête recopiée de supabase/functions/_shared/overpass.ts plutôt
// qu'importée : ce module ajoute des miroirs de secours au-delà de ceux de
// l'app. Les miroirs publics tombent régulièrement (overpass-api.de et
// kumi.systems renvoyaient des 504 pendant l'écriture de ce script) et un
// outil de vérification ne doit pas être inutilisable ce jour-là. Si les
// filtres de la requête changent côté serveur, les reporter ici.

import fs from 'node:fs';
import path from 'node:path';

export const RADIUS = 500;

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const CACHE_DIR = path.join(import.meta.dirname, '.osm-cache');

const HIGHWAY_TYPES =
  'footway|path|pedestrian|living_street|residential|unclassified|tertiary|secondary|primary|track|steps|cycleway|service';
const GREEN_LEISURE = 'park|garden|nature_reserve|recreation_ground|pitch|sports_centre';
const GREEN_LANDUSE = 'forest|meadow';

function query(lat, lon, radius) {
  const around = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`;
  return `
[out:json][timeout:90];
way(${around})
  ["highway"~"^(${HIGHWAY_TYPES})$"]
  ["area"!="yes"]
  ["access"!~"^(private|no)$"]
  ["foot"!~"^(private|no)$"]
  ["service"!~"^(parking_aisle|driveway|drive-through)$"]->.roads;
(
  way(${around})["leisure"~"^(${GREEN_LEISURE})$"];
  way(${around})["landuse"~"^(${GREEN_LANDUSE})$"];
  way(${around})["natural"="wood"];
)->.green;
.roads out body;
.roads>;
out skel qt;
.green out geom;`;
}

export async function fetchZone(lat, lon, radius) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${lat.toFixed(6)}_${lon.toFixed(6)}_${radius}.json`);
  let json;

  if (fs.existsSync(file)) {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    const errors = [];
    for (const mirror of MIRRORS) {
      try {
        const res = await fetch(mirror, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query(lat, lon, radius)),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Walkedia/1.0 (+https://github.com/Physicy/walkedia)',
          },
          signal: AbortSignal.timeout(150000),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        json = await res.json();
        break;
      } catch (err) {
        errors.push(`${new URL(mirror).host}: ${err.message}`);
      }
    }
    if (!json) throw new Error(`aucun miroir Overpass n'a répondu — ${errors.join(', ')}`);
    fs.writeFileSync(file, JSON.stringify(json));
  }

  const nodes = new Map();
  const ways = [];
  const greenAreas = [];
  for (const el of json.elements || []) {
    if (el.type === 'node') nodes.set(el.id, [el.lat, el.lon]);
    else if (el.type === 'way' && el.geometry && el.geometry.length >= 3)
      greenAreas.push({ id: el.id, ring: el.geometry.map((p) => [p.lat, p.lon]) });
    else if (el.type === 'way' && el.nodes && el.nodes.length >= 2)
      ways.push({ id: el.id, nodes: el.nodes, tags: el.tags || {} });
  }
  return { osm: { nodes, ways }, greenAreas };
}

// Même arrondi que snapToGrid côté client et côté Edge Function : `kx` dérive
// de la latitude arrondie, jamais de celle reçue (voir get-region/index.ts).
export function snapToGrid(lat, lon, cellMeters) {
  const ky = 110540;
  const gy = (Math.round((lat * ky) / cellMeters) * cellMeters) / ky;
  const kx = 111320 * Math.cos((gy * Math.PI) / 180);
  const gx = (Math.round((lon * kx) / cellMeters) * cellMeters) / kx;
  return [gy, gx];
}

export function offsetCenter(lat, lon, dxMeters, dyMeters) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110540;
  return snapToGrid(lat + dyMeters / ky, lon + dxMeters / kx, RADIUS);
}
