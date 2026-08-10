// Edge Function : sert le graphe calculé pour une zone (centre arrondi +
// rayon), avec cache partagé entre joueurs (table `regions`). Même modèle
// "cercle centré" que le client (RADIUS/snapToGrid dans
// mobile/src/hooks/useWalkedia.ts), pas une grille de tuiles indépendantes
// — voir le plan pour pourquoi (buildGraph n'a pas de limite de distance
// sur les fusions de degré 2, une grille indépendante fragmenterait les
// arêtes/carrefours aux frontières).
//
// Lazy-build-on-miss (v1, voir plan) : le premier appel sur une nouvelle zone
// attend le calcul, tous les suivants lisent le cache. `état`
// (débloqué/récent) n'est jamais calculé ici — ce payload est partagé entre
// joueurs, l'état de progression reste entièrement côté client (table
// `progress`, déjà existante).
//
// Ce qui est attendu, c'est la VOIRIE seule. Les quartiers (donnée de confort
// pour les stats de profil) sont récupérés après la réponse : mesuré en
// production, cette requête pesait 60 002 ms sur les 60 517 ms d'un chargement
// rural, et 4 644 ms sur 5 605 ms à Bordeaux — elle décidait du temps d'attente
// du joueur à elle seule. Le client d'origine l'appelait déjà sans jamais
// l'attendre ; la porter côté serveur lui avait rendu ce pouvoir de blocage.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchZone, fetchNeighborhoods, type Neighborhood } from '../_shared/overpass.ts';
import { buildGraph } from '../_shared/graph.ts';
import { assignNeighborhoods } from '../_shared/neighborhoods.ts';
import { serializeGraph, clipGraph } from '../_shared/serialize.ts';

// Doit rester identique à RADIUS dans mobile/src/hooks/useWalkedia.ts : pas
// du tout ce qu'on CONSTRUIT (voir BUILD_RADIUS), juste le pas de la grille
// de centres, donc la clé de cache.
const RADIUS = 500;

// Marge de construction. Le client fusionne les graphes de plusieurs zones
// sans jamais reconstruire : il faut donc que deux zones voisines produisent
// EXACTEMENT les mêmes arêtes là où elles se recouvrent. Or buildGraph fusionne
// les chaînes de degré 2 sans limite de distance : une chaîne s'interrompt
// artificiellement au bord des données, ce qui donne une arête (donc un ID
// géométrique) différente de part et d'autre.
//
// Mesuré sur 4 zones adjacentes (Paris/Châtelet et périurbain rennais) :
//   - sans marge (construire et servir r=500) : 0 arête manquante, mais 3,4 %
//     à 6,2 % d'arêtes fragmentées EN TROP, et jusqu'à 9 % de carrefours
//     fantômes — des doublons superposés qui rendraient la complétion fausse.
//   - avec cette marge : 1 arête d'écart sur 4834 à Paris, 0 en périurbain.
// Coût : ~320 ms de buildGraph par zone à Paris (budget Edge Function : 2 s
// de CPU), payé une seule fois par zone grâce au cache.
const BUILD_RADIUS = 1000; // rayon interrogé auprès d'Overpass et construit
const SERVE_RADIUS = 550;  // rayon effectivement servi au client (> RADIUS :
                           // recouvre le cercle que le client considère chargé)

// Version du contrat de payload (voir _shared/serialize.ts). Une entrée de
// cache d'une version antérieure est ignorée et recalculée : les IDs et la
// forme du payload changent d'une version à l'autre.
//
// Pas de bump pour les quartiers différés : les champs ajoutés sont optionnels
// et les entrées déjà en cache ont leurs quartiers, donc elles restent
// parfaitement servables telles quelles.
const VERSION = '2';

// Une zone servie sans ses quartiers reste marquée à compléter. Si la tâche de
// fond n'a pas abouti (instance recyclée, Overpass muet), une requête
// ultérieure sur la zone retente — mais pas à chaque appel, sinon une panne
// Overpass déclencherait une requête par visite. Ce délai est le minimum entre
// deux tentatives.
const NEIGHBORHOOD_RETRY_DELAY = 10 * 60 * 1000; // ms

// Même calcul que snapToGrid (useWalkedia.ts) — la clé de cache doit
// retomber sur le même point pour deux requêtes voisines, sinon le cache
// ne sert jamais (chaque joueur créerait sa propre entrée légèrement
// décalée).
function snapToGrid(lat: number, lon: number, cellMeters: number): [number, number] {
  const ky = 110540;
  const gy = (Math.round((lat * ky) / cellMeters) * cellMeters) / ky;
  // `kx` dérive de la latitude ARRONDIE, jamais de celle reçue. Sinon deux
  // points de la même case, à des latitudes un peu différentes, retombent bien
  // sur le même index de case mais reconstruisent une longitude légèrement
  // différente : deux clés de cache pour la même zone, donc un recalcul complet
  // par joueur au lieu d'un cache partagé. Observé en production avant
  // correction : 2.348362 et 2.348386 pour la même case.
  const kx = 111320 * Math.cos((gy * Math.PI) / 180);
  const gx = (Math.round((lon * kx) / cellMeters) * cellMeters) / kx;
  return [gy, gx];
}

function regionId(lat: number, lon: number, radius: number): string {
  return `${lat.toFixed(6)},${lon.toFixed(6)},${radius}`;
}

// `timings` (ms) est ajouté au corps de la RÉPONSE, jamais au payload stocké :
// des durées mises en cache seraient figées et trompeuses à la relecture. Il a
// d'abord été exposé en en-tête `x-walkedia-timings`, mais la passerelle
// Supabase/Cloudflare filtre les en-têtes de réponse inconnus. Le client ignore
// ce champ (regionGraph.ts ne lit que les clés qu'il connaît) ; il sert à
// savoir d'où vient une lenteur sans redéployer une version instrumentée.
const json = (body: unknown, status = 200, timings?: Record<string, number>) => {
  const withTimings =
    timings && body && typeof body === 'object'
      ? { ...(body as object), timings: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v)])) }
      : body;
  return new Response(JSON.stringify(withTimings), {
    status,
    headers: { 'content-type': 'application/json' },
  });
};

// Prolonge la vie de l'instance au-delà de la réponse, le temps que la tâche
// de fond finisse. `EdgeRuntime` est fourni par le runtime Supabase ; le repli
// sert aux exécutions hors de ce runtime (test local), où la promesse tourne
// simplement sans garantie d'aboutir.
function waitUntil(p: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(p);
  else void p.catch(() => {});
}

// Récupère les quartiers APRÈS que la réponse est partie, et complète la ligne
// de cache. Ne renvoie rien et n'échoue jamais bruyamment : le joueur a déjà
// sa zone, et une zone sans quartiers reste parfaitement jouable — seules les
// statistiques par quartier du profil sont absentes.
async function completeNeighborhoods(
  supabase: ReturnType<typeof createClient>,
  id: string,
  slat: number,
  slon: number,
  junctions: [string, { lat: number; lon: number }][]
) {
  try {
    const neighborhoods = await fetchNeighborhoods(slat, slon, SERVE_RADIUS);
    const junctionNeighborhood = assignNeighborhoods(
      new Map(junctions),
      new Map(neighborhoods.map((n) => [n.id, n]))
    );

    // Relecture avant écriture : entre-temps, la zone a pu être recalculée
    // (bump de version). On ne complète que ce qui est encore d'actualité.
    const { data: row } = await supabase.from('regions').select('payload, version').eq('id', id).maybeSingle();
    if (!row || row.version !== VERSION) return;
    const payload = row.payload as Record<string, unknown>;
    if (!payload?.neighborhoodsPending) return;

    await supabase
      .from('regions')
      .update({
        payload: {
          ...payload,
          neighborhoods,
          junctionNeighborhood: [...junctionNeighborhood.entries()],
          neighborhoodsPending: false,
          neighborhoodsTriedAt: new Date().toISOString(),
        },
      })
      .eq('id', id);
  } catch (err) {
    // Échec (Overpass muet, instance recyclée) : rien à écrire. Le marqueur
    // `neighborhoodsPending` reste posé et `neighborhoodsTriedAt` a été
    // horodaté AVANT la tentative, donc une visite ultérieure de la zone
    // retentera d'elle-même passé NEIGHBORHOOD_RETRY_DELAY.
    console.error('Quartiers différés en échec pour', id, ':', (err as Error).message);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST uniquement' }, 405);

  let lat: number, lon: number;
  try {
    const body = await req.json();
    lat = Number(body.lat);
    lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('lat/lon invalides');
  } catch (err) {
    return json({ error: 'Requête invalide : ' + (err as Error).message }, 400);
  }

  const [slat, slon] = snapToGrid(lat, lon, RADIUS);
  const id = regionId(slat, slon, RADIUS);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const t0 = performance.now();
  const since = (t: number) => performance.now() - t;

  const { data: existing, error: readError } = await supabase
    .from('regions')
    .select('payload, version')
    .eq('id', id)
    .maybeSingle();
  const readMs = since(t0);
  if (readError) return json({ error: 'Lecture cache impossible : ' + readError.message }, 500);

  if (existing && existing.version === VERSION) {
    const cached = existing.payload as Record<string, unknown>;
    // Zone servie autrefois sans ses quartiers : on la sert quand même
    // immédiatement, et on relance la complétion en tâche de fond si la
    // dernière tentative est assez ancienne. L'horodatage est posé AVANT de
    // lancer, pour que plusieurs visites rapprochées ne déclenchent pas
    // plusieurs fois la même requête Overpass.
    if (cached?.neighborhoodsPending) {
      const triedAt = Date.parse(String(cached.neighborhoodsTriedAt ?? 0)) || 0;
      if (Date.now() - triedAt > NEIGHBORHOOD_RETRY_DELAY) {
        const junctions = (cached.graph as { junctions: [string, { lat: number; lon: number }][] }).junctions;
        waitUntil(
          supabase
            .from('regions')
            .update({ payload: { ...cached, neighborhoodsTriedAt: new Date().toISOString() } })
            .eq('id', id)
            .then(() => completeNeighborhoods(supabase, id, slat, slon, junctions))
        );
      }
    }
    return json(cached, 200, { lecture: readMs, total: since(t0) });
  }

  // Cache miss (ou entrée périmée) : calcule la voirie, écrit, répond — et ne
  // récupère les quartiers qu'ensuite (voir l'en-tête de fichier).
  let osm, greenAreas;
  const tFetch = performance.now();
  try {
    const zone = await fetchZone(slat, slon, BUILD_RADIUS);
    osm = zone.osm;
    greenAreas = zone.greenAreas;
  } catch (err) {
    return json({ error: 'Overpass indisponible : ' + (err as Error).message }, 502);
  }
  const zoneMs = since(tFetch);

  const tBuild = performance.now();
  const full = await buildGraph(osm, greenAreas.map((a) => a.ring));
  const graph = clipGraph(full, [slat, slon], SERVE_RADIUS);
  const buildMs = since(tBuild);

  // Les espaces verts ne servaient qu'à buildGraph (voir graph.ts) : plus
  // rien côté client n'en a besoin maintenant que le graphe arrive construit,
  // donc ils ne sont pas dans le payload (~15 % de poids en moins).
  //
  // `neighborhoods`/`junctionNeighborhood` partent vides : le client sait les
  // lire tels quels (aucune statistique par quartier pour cette session-là),
  // et la tâche de fond les remplira dans la ligne de cache.
  const tSerialize = performance.now();
  const payload = {
    graph: serializeGraph(graph),
    neighborhoods: [] as Neighborhood[],
    junctionNeighborhood: [] as [string, number | null][],
    center: [slat, slon],
    radius: RADIUS,
    neighborhoodsPending: true,
    neighborhoodsTriedAt: new Date().toISOString(),
  };
  const serializeMs = since(tSerialize);

  const tWrite = performance.now();
  const { error: writeError } = await supabase.from('regions').upsert({
    id,
    center: `SRID=4326;POINT(${slon} ${slat})`,
    radius: RADIUS,
    payload,
    version: VERSION,
    computed_at: new Date().toISOString(),
  });
  if (writeError) {
    // Le calcul a réussi, seule l'écriture en cache a échoué : on répond
    // quand même (pas de raison de faire payer ça au joueur), le prochain
    // appel sur cette zone retentera juste le calcul.
    console.error('Écriture cache échouée:', writeError.message);
  }
  const writeMs = since(tWrite);

  // Les quartiers ne démarrent qu'ici : le payload est prêt, la réponse part
  // juste après, et cette requête ne retarde plus personne. Inutile si la
  // ligne n'a pas pu être écrite — il n'y aurait rien à compléter.
  if (!writeError) {
    waitUntil(completeNeighborhoods(supabase, id, slat, slon, payload.graph.junctions as [string, { lat: number; lon: number }][]));
  }

  return json(payload, 200, {
    lecture: readMs,
    overpass_zone: zoneMs,
    construction: buildMs,
    serialisation: serializeMs,
    ecriture_cache: writeMs,
    total: since(t0),
  });
});
