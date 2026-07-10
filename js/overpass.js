// Récupération du réseau piéton depuis l'API Overpass (OpenStreetMap).

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const HIGHWAY_TYPES =
  'footway|path|pedestrian|living_street|residential|unclassified|tertiary|secondary|primary|track|steps|cycleway|service';

export async function fetchNetwork(lat, lon, radius) {
  const query = `
[out:json][timeout:40];
way(around:${radius},${lat.toFixed(6)},${lon.toFixed(6)})
  ["highway"~"^(${HIGHWAY_TYPES})$"]
  ["area"!="yes"]
  ["access"!~"^(private|no)$"]
  ["foot"!~"^(private|no)$"]
  ["service"!~"^(parking_aisle|driveway|drive-through)$"];
out body;
>;
out skel qt;`;

  let lastErr = null;
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const json = await res.json();
      return parseOsm(json);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Overpass injoignable');
}

function parseOsm(json) {
  const nodes = new Map(); // id -> [lat, lon]
  const ways = [];
  for (const el of json.elements || []) {
    if (el.type === 'node') nodes.set(el.id, [el.lat, el.lon]);
    else if (el.type === 'way' && el.nodes && el.nodes.length >= 2) {
      ways.push({ id: el.id, nodes: el.nodes, tags: el.tags || {} });
    }
  }
  return { nodes, ways };
}
