// Récupération du réseau piéton (et des espaces verts) depuis l'API
// Overpass (OpenStreetMap), en une seule requête par zone.

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
// même en zone urbaine (voir graph.js) — volontairement distinct des
// places/esplanades, dont l'exclusion des maillages urbains reste voulue.
const GREEN_LEISURE = 'park|garden|nature_reserve|recreation_ground|pitch|sports_centre';
const GREEN_LANDUSE = 'forest|meadow';

const HEDGE_DELAY = 5000;   // ms : au-delà, on tente le miroir suivant EN PLUS (sans annuler
                            // le précédent) plutôt que d'attendre son échec complet
const HARD_TIMEOUT = 60000; // ms : plafond absolu, tous miroirs confondus — un miroir peut
                            // mettre en file d'attente une requête sans jamais répondre
                            // (le [timeout:40] serveur ne borne que l'exécution une fois
                            // démarrée, pas l'attente en file), donc on ne compte pas
                            // uniquement sur son propre timeout.

function fetchMirror(url, query, signal) {
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
// ou en file d'attente ne doit pas bloquer les autres (avant, jusqu'à 45s ×
// 3 miroirs pouvaient s'accumuler avant l'échec final). Le premier miroir
// est lancé seul ; si aucune réponse après HEDGE_DELAY, le suivant est lancé
// EN PLUS (pas à sa place), et ainsi de suite — le premier qui répond
// gagne, les autres sont annulés. Un plafond HARD_TIMEOUT global garantit
// qu'on échoue proprement même si tous les miroirs restent muets.
async function runQuery(query) {
  const controllers = MIRRORS.map(() => new AbortController());
  const hardAbort = setTimeout(() => controllers.forEach((c) => c.abort()), HARD_TIMEOUT);

  try {
    return await new Promise((resolve, reject) => {
      const errors = [];
      let settled = false;
      let launched = 0;
      let hedgeTimer = null;

      const launchNext = () => {
        const i = launched++;
        fetchMirror(MIRRORS[i], query, controllers[i].signal).then(
          (json) => {
            if (settled) return;
            settled = true;
            clearTimeout(hedgeTimer);
            resolve(json);
          },
          (err) => {
            errors[i] = err;
            if (settled) return;
            if (launched >= MIRRORS.length && errors.filter(Boolean).length === MIRRORS.length) {
              settled = true;
              reject(errors);
            } else if (launched < MIRRORS.length) {
              // Échec avant le délai de hedge (ex: 429 immédiat) : inutile
              // d'attendre le reste du délai, on tente le suivant de suite.
              clearTimeout(hedgeTimer);
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
    controllers.forEach((c) => c.abort()); // annule les tentatives encore en cours (perdantes ou non résolues)
  }
}

// Récupère en un seul appel le réseau piéton (ways + nœuds) et les contours
// des espaces verts (parcs/jardins/forêts/terrains de sport) autour du point
// donné. Les deux jeux de résultats sont séparés via des sets Overpass
// nommés (`.roads` / `.green`) pour n'avoir besoin que d'une requête réseau
// par zone (au lieu de deux, qui doublait notre taux contre des miroirs
// publics déjà rate-limités).
export async function fetchZone(lat, lon, radius) {
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

// Sépare les éléments de la réponse combinée : les ways avec `geometry`
// inline (issus de `.green out geom`) sont des contours d'espace vert ; les
// autres ways (avec `nodes` + `tags`, issus de `.roads out body`) sont le
// réseau piéton, dont les nœuds sont résolus depuis les éléments `node`.
function parseZone(json) {
  const nodes = new Map(); // id -> [lat, lon]
  const ways = [];
  const greenAreas = [];
  for (const el of json.elements || []) {
    if (el.type === 'node') {
      nodes.set(el.id, [el.lat, el.lon]);
    } else if (el.type === 'way' && el.geometry && el.geometry.length >= 3) {
      greenAreas.push({ id: el.id, ring: el.geometry.map((p) => [p.lat, p.lon]) });
    } else if (el.type === 'way' && el.nodes && el.nodes.length >= 2) {
      ways.push({ id: el.id, nodes: el.nodes, tags: el.tags || {} });
    }
  }
  return { osm: { nodes, ways }, greenAreas };
}
