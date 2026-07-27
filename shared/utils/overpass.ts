import type { Coord } from '../types/index.js';

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const HIGHWAY_TYPES = 'footway|path|pedestrian|living_street|residential|unclassified|tertiary|secondary|primary|track|steps|cycleway|service';

export interface OSMResponse {
  nodes: Map<string, Coord>;
  ways: Array<{
    id: string;
    nodes: string[];
    tags: Record<string, string>;
  }>;
}

export async function fetchNetwork(lat: number, lon: number, radius: number): Promise<OSMResponse> {
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

  let lastErr: Error | null = null;
  for (const url of MIRRORS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const json = await res.json();
      return parseOsm(json);
    } catch (err) {
      lastErr =
        err instanceof Error && err.name === 'AbortError'
          ? new Error('serveurs OSM saturés, réessaie dans un instant')
          : (err as Error);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('Overpass injoignable');
}

interface OSMElement {
  type: 'node' | 'way';
  id: string;
  lat?: number;
  lon?: number;
  nodes?: string[];
  tags?: Record<string, string>;
}

interface OSMJSON {
  elements?: OSMElement[];
}

function parseOsm(json: OSMJSON): OSMResponse {
  const nodes = new Map<string, Coord>();
  const ways: Array<{
    id: string;
    nodes: string[];
    tags: Record<string, string>;
  }> = [];

  for (const el of json.elements || []) {
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      nodes.set(el.id, [el.lat, el.lon]);
    } else if (el.type === 'way' && el.nodes && el.nodes.length >= 2) {
      ways.push({
        id: el.id,
        nodes: el.nodes,
        tags: el.tags || {},
      });
    }
  }
  return { nodes, ways };
}
