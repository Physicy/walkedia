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
import { serializeGraph } from '../_shared/serialize.ts';

// Doit rester identique à RADIUS dans mobile/src/hooks/useWalkedia.ts.
const RADIUS = 500;

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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST uniquement' }), { status: 405 });
  }

  let lat: number, lon: number;
  try {
    const body = await req.json();
    lat = Number(body.lat);
    lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('lat/lon invalides');
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Requête invalide : ' + (err as Error).message }), { status: 400 });
  }

  const [slat, slon] = snapToGrid(lat, lon, RADIUS);
  const id = regionId(slat, slon, RADIUS);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: existing, error: readError } = await supabase.from('regions').select('payload').eq('id', id).maybeSingle();
  if (readError) {
    return new Response(JSON.stringify({ error: 'Lecture cache impossible : ' + readError.message }), { status: 500 });
  }
  if (existing) {
    return new Response(JSON.stringify(existing.payload), { headers: { 'content-type': 'application/json' } });
  }

  // Cache miss : calcule (Overpass + buildGraph), écrit, répond.
  let osm, greenAreas, neighborhoods: Neighborhood[];
  try {
    const [zone, quartiers] = await Promise.all([
      fetchZone(slat, slon, RADIUS),
      fetchNeighborhoods(slat, slon, RADIUS).catch(() => [] as Neighborhood[]),
    ]);
    osm = zone.osm;
    greenAreas = zone.greenAreas;
    neighborhoods = quartiers;
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Overpass indisponible : ' + (err as Error).message }), { status: 502 });
  }

  const graph = await buildGraph(osm, greenAreas.map((a) => a.ring));
  const neighborhoodMap = new Map(neighborhoods.map((n) => [n.id, n]));
  const junctionNeighborhood = assignNeighborhoods(graph.junctions, neighborhoodMap);

  const payload = {
    graph: serializeGraph(graph),
    greenAreas,
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
    version: '1',
  });
  if (writeError) {
    // Le calcul a réussi, seule l'écriture en cache a échoué : on répond
    // quand même (pas de raison de faire payer ça au joueur), le prochain
    // appel sur cette zone retentera juste le calcul (~150ms).
    console.error('Écriture cache échouée:', writeError.message);
  }

  return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
});
