// Accès à l'API Overpass. Seul exemplaire depuis la bascule du client sur
// l'Edge Function : plus aucun appareil ne tape Overpass directement, tout
// passe par get-region et son cache — ce qui rend aussi les pannes de
// miroirs publics invisibles pour toute zone déjà calculée.

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Les miroirs publics rate-limitent (429) les requêtes sans identification
// claire ("Please include a meaningful User-Agent string...").
const USER_AGENT = 'Walkedia/1.0 (+https://github.com/Physicy/walkedia)';

const HIGHWAY_TYPES =
  'footway|path|pedestrian|living_street|residential|unclassified|tertiary|secondary|primary|track|steps|cycleway|service';

// Tags "espace vert" : parcs/jardins, forêts, terrains de sport. Un carrefour
// piéton situé à l'intérieur d'un de ces contours compte toutes ses branches
// même en zone urbaine (voir graph.ts) — volontairement distinct des
// places/esplanades, dont l'exclusion des maillages urbains reste voulue.
const GREEN_LEISURE = 'park|garden|nature_reserve|recreation_ground|pitch|sports_centre';
const GREEN_LANDUSE = 'forest|meadow';

// Quartiers ("place=suburb/neighbourhood/quarter") : en pratique, ce tag
// n'a un contour polygonal (way fermé) que dans une minorité de villes bien
// cartographiées — ailleurs, ce n'est qu'un nœud sans géométrie
// exploitable, donc pas de quartier assigné aux carrefours de la zone.
const PLACE_QUARTIER = 'suburb|neighbourhood|quarter';

const HEDGE_DELAY = 5000;
const HARD_TIMEOUT = 60000;

function fetchMirror(url: string, query: string, signal: AbortSignal) {
  return fetch(url, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    signal,
  }).then((res) => {
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    return res.json();
  });
}

// Interroge les miroirs en parallèle plutôt qu'en séquence : un miroir lent
// ou en file d'attente ne doit pas bloquer les autres. Le premier miroir est
// lancé seul ; si aucune réponse après HEDGE_DELAY, le suivant est lancé EN
// PLUS (pas à sa place), et ainsi de suite — le premier qui répond gagne,
// les autres sont annulés. Un plafond HARD_TIMEOUT global garantit qu'on
// échoue proprement même si tous les miroirs restent muets.
async function runQuery(query: string): Promise<any> {
  const controllers = MIRRORS.map(() => new AbortController());
  const hardAbort = setTimeout(() => controllers.forEach((c) => c.abort()), HARD_TIMEOUT);

  try {
    return await new Promise((resolve, reject) => {
      const errors: any[] = [];
      let settled = false;
      let launched = 0;
      let hedgeTimer: ReturnType<typeof setTimeout> | null = null;

      const launchNext = () => {
        const i = launched++;
        fetchMirror(MIRRORS[i], query, controllers[i].signal).then(
          (json) => {
            if (settled) return;
            settled = true;
            if (hedgeTimer) clearTimeout(hedgeTimer);
            resolve(json);
          },
          (err) => {
            errors[i] = err;
            if (settled) return;
            if (launched >= MIRRORS.length && errors.filter(Boolean).length === MIRRORS.length) {
              settled = true;
              reject(errors);
            } else if (launched < MIRRORS.length) {
              if (hedgeTimer) clearTimeout(hedgeTimer);
              launchNext();
            }
          }
        );
        if (launched < MIRRORS.length) hedgeTimer = setTimeout(launchNext, HEDGE_DELAY);
      };
      launchNext();
    });
  } catch (errors) {
    const timedOut = Array.isArray(errors) && errors.some((e) => e && e.name === 'AbortError');
    throw timedOut || !Array.isArray(errors) || !errors.length
      ? new Error('serveurs OSM saturés, réessaie dans un instant')
      : errors.find(Boolean);
  } finally {
    clearTimeout(hardAbort);
    controllers.forEach((c) => c.abort());
  }
}

export interface OsmWay {
  id: number;
  nodes: number[];
  tags: Record<string, string>;
}

export interface GreenArea {
  id: number;
  ring: [number, number][];
}

export interface Neighborhood {
  id: number;
  name: string | null;
  ring: [number, number][];
}

// Récupère en un seul appel le réseau piéton (ways + nœuds) et les contours
// des espaces verts autour du point donné. Les quartiers (fetchNeighborhoods
// ci-dessous) sont une requête séparée, jamais fusionnée ici.
export async function fetchZone(
  lat: number,
  lon: number,
  radius: number
): Promise<{ osm: { nodes: Map<number, [number, number]>; ways: OsmWay[] }; greenAreas: GreenArea[] }> {
  const around = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`;
  const query = `
[out:json][timeout:40];
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

  const json = await runQuery(query);
  return parseZone(json);
}

function parseZone(json: any) {
  const nodes = new Map<number, [number, number]>();
  const ways: OsmWay[] = [];
  const greenAreas: GreenArea[] = [];
  for (const el of json.elements || []) {
    if (el.type === 'node') {
      nodes.set(el.id, [el.lat, el.lon]);
    } else if (el.type === 'way' && el.geometry && el.geometry.length >= 3) {
      greenAreas.push({ id: el.id, ring: el.geometry.map((p: any) => [p.lat, p.lon]) });
    } else if (el.type === 'way' && el.nodes && el.nodes.length >= 2) {
      ways.push({ id: el.id, nodes: el.nodes, tags: el.tags || {} });
    }
  }
  return { osm: { nodes, ways }, greenAreas };
}

export async function fetchNeighborhoods(lat: number, lon: number, radius: number): Promise<Neighborhood[]> {
  const around = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`;
  const query = `
[out:json][timeout:20];
way(${around})["place"~"^(${PLACE_QUARTIER})$"]["name"]->.quartiers;
.quartiers out geom;`;

  const json = await runQuery(query);
  return parseNeighborhoods(json);
}

function parseNeighborhoods(json: any): Neighborhood[] {
  const neighborhoods: Neighborhood[] = [];
  for (const el of json.elements || []) {
    if (el.type === 'way' && el.geometry && el.geometry.length >= 3) {
      const t = el.tags || {};
      neighborhoods.push({ id: el.id, name: t.name || null, ring: el.geometry.map((p: any) => [p.lat, p.lon]) });
    }
  }
  return neighborhoods;
}
