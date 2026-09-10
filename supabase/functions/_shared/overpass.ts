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

// A5 de la spécification (infrastructures non praticables à pied) est traité
// ici, et nulle part ailleurs : seules des ways `highway=...` sont demandées.
// Une voie de tram ou une voie ferrée n'entre donc jamais dans les données,
// n'apporte aucun nœud, et ne peut pas créer de point d'intersection là où
// elle croise visuellement une rue.
const HIGHWAY_TYPES =
  'footway|path|pedestrian|living_street|residential|unclassified|tertiary|secondary|primary|track|steps|cycleway|service';

// Tags "espace vert" : parcs/jardins, forêts, terrains de sport. Un carrefour
// de chemins situé à l'intérieur d'un de ces contours compte toutes ses
// branches, y compris les bifurcations mineures de sentiers (A3, régime
// « parc / forêt ») — volontairement distinct des places/esplanades, dont
// l'exclusion des maillages urbains reste voulue.
const GREEN_LEISURE = 'park|garden|nature_reserve|recreation_ground|pitch|sports_centre';
const GREEN_LANDUSE = 'forest|meadow';

// Tags "zone urbaine standard" au sens d'A3 : là où seules les voies
// carrossables et les rues piétonnes génèrent un point. Récupérés dans la même
// requête que la voirie (pas de tour réseau supplémentaire). Le `landuse` est
// la source directe de la règle ; la densité de voirie calculée dans graph.ts
// reste le repli, indispensable là où personne n'a cartographié de `landuse`.
const URBAN_LANDUSE = 'residential|commercial|retail';

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

export interface UrbanArea {
  id: number;
  ring: [number, number][];
}

export interface Neighborhood {
  id: number;
  name: string | null;
  ring: [number, number][];
}

// Récupère en un seul appel le réseau piéton (ways + nœuds) et les contours de
// zones qui décident du régime de filtrage (A3) : espaces verts et `landuse`
// urbain. Les quartiers (fetchNeighborhoods ci-dessous) sont une requête
// séparée, jamais fusionnée ici.
export async function fetchZone(
  lat: number,
  lon: number,
  radius: number
): Promise<{
  osm: { nodes: Map<number, [number, number]>; ways: OsmWay[] };
  greenAreas: GreenArea[];
  urbanAreas: UrbanArea[];
}> {
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
way(${around})["landuse"~"^(${URBAN_LANDUSE})$"]->.urbain;
.roads out body;
.roads>;
out skel qt;
.green out geom;
.urbain out geom;`;

  const json = await runQuery(query);
  return parseZone(json);
}

// Les contours arrivent tous par `out geom` dans le même flot : c'est leur
// tag qui dit à quel régime ils appartiennent, pas leur position dans la
// réponse. Le vert l'emporte sur l'urbain quand un contour porte les deux
// (un parc taggé dans un `landuse` résidentiel), comme dans graph.ts.
export function isGreenRing(tags: Record<string, string>): boolean {
  return (
    new RegExp(`^(${GREEN_LEISURE})$`).test(tags.leisure || '') ||
    new RegExp(`^(${GREEN_LANDUSE})$`).test(tags.landuse || '') ||
    tags.natural === 'wood'
  );
}

function parseZone(json: any) {
  const nodes = new Map<number, [number, number]>();
  const ways: OsmWay[] = [];
  const greenAreas: GreenArea[] = [];
  const urbanAreas: UrbanArea[] = [];
  for (const el of json.elements || []) {
    if (el.type === 'node') {
      nodes.set(el.id, [el.lat, el.lon]);
    } else if (el.type === 'way' && el.geometry && el.geometry.length >= 3) {
      const ring = { id: el.id, ring: el.geometry.map((p: any) => [p.lat, p.lon]) };
      if (isGreenRing(el.tags || {})) greenAreas.push(ring);
      else urbanAreas.push(ring);
    } else if (el.type === 'way' && el.nodes && el.nodes.length >= 2) {
      ways.push({ id: el.id, nodes: el.nodes, tags: el.tags || {} });
    }
  }
  return { osm: { nodes, ways }, greenAreas, urbanAreas };
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
