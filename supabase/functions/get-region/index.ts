// Edge Function : sert le graphe calculé pour une zone (centre arrondi +
// rayon), avec cache partagé entre joueurs (table `regions`). Même modèle
// "cercle centré" que le client (RADIUS/snapToGrid dans
// mobile/src/hooks/useWalkedia.ts), pas une grille de tuiles indépendantes
// — voir le plan pour pourquoi (buildGraph n'a pas de limite de distance
// sur les fusions de degré 2, une grille indépendante fragmenterait les
// arêtes/carrefours aux frontières).
//
// Lazy-build-on-miss synchrone (v1, voir plan) : le premier appel sur une
// nouvelle zone attend le calcul complet, tous les suivants lisent le
// cache. `état` (débloqué/récent) n'est jamais calculé ici — ce payload est
// partagé entre joueurs, l'état de progression reste entièrement côté
// client (table `progress`, déjà existante).

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
const VERSION = '2';

// Même calcul que snapToGrid (useWalkedia.ts) — la clé de cache doit
// retomber sur le même point pour deux requêtes voisines, sinon le cache
// ne sert jamais (chaque joueur créerait sa propre entrée légèrement
// décalée).
function snapToGrid(lat: number, lon: number, cellMeters: number): [number, number] {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110540;
  const gx = (Math.round((lon * kx) / cellMeters) * cellMeters) / kx;
  const gy = (Math.round((lat * ky) / cellMeters) * cellMeters) / ky;
  return [gy, gx];
}

function regionId(lat: number, lon: number, radius: number): string {
  return `${lat.toFixed(6)},${lon.toFixed(6)},${radius}`;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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

  const { data: existing, error: readError } = await supabase
    .from('regions')
    .select('payload, version')
    .eq('id', id)
    .maybeSingle();
  if (readError) return json({ error: 'Lecture cache impossible : ' + readError.message }, 500);
  if (existing && existing.version === VERSION) return json(existing.payload);

  // Cache miss (ou entrée périmée) : calcule, écrit, répond.
  let osm, greenAreas, neighborhoods: Neighborhood[];
  try {
    const [zone, quartiers] = await Promise.all([
      fetchZone(slat, slon, BUILD_RADIUS),
      fetchNeighborhoods(slat, slon, SERVE_RADIUS).catch(() => [] as Neighborhood[]),
    ]);
    osm = zone.osm;
    greenAreas = zone.greenAreas;
    neighborhoods = quartiers;
  } catch (err) {
    return json({ error: 'Overpass indisponible : ' + (err as Error).message }, 502);
  }

  const full = await buildGraph(osm, greenAreas.map((a) => a.ring));
  const graph = clipGraph(full, [slat, slon], SERVE_RADIUS);
  const neighborhoodMap = new Map(neighborhoods.map((n) => [n.id, n]));
  const junctionNeighborhood = assignNeighborhoods(graph.junctions, neighborhoodMap);

  // Les espaces verts ne servaient qu'à buildGraph (voir graph.ts) : plus
  // rien côté client n'en a besoin maintenant que le graphe arrive construit,
  // donc ils ne sont pas dans le payload (~15 % de poids en moins).
  const payload = {
    graph: serializeGraph(graph),
    neighborhoods,
    junctionNeighborhood: [...junctionNeighborhood.entries()],
    center: [slat, slon],
    radius: RADIUS,
  };

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

  return json(payload);
});
