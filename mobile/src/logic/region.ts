// Chargement d'une zone depuis l'Edge Function `get-region` (cache partagé
// entre joueurs, voir supabase/functions/get-region/index.ts). La forme du
// graphe reçu et sa fusion dans le graphe cumulé sont dans regionGraph.ts —
// ici, uniquement l'appel réseau et ses modes d'échec.

import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase';
import { deserializeRegion, type Region } from './regionGraph';

// Plafond côté client : sur une zone jamais calculée, la fonction fait tout
// le travail en synchrone (Overpass + construction), et les miroirs Overpass
// publics peuvent mettre très longtemps — mieux vaut échouer proprement avec
// un message que de laisser le chargement pendre indéfiniment.
const REQUEST_TIMEOUT = 90000;

// Appel HTTP direct plutôt que supabase.functions.invoke() : ce dernier
// n'expose pas d'AbortSignal, or un miss de cache peut prendre très
// longtemps (voir REQUEST_TIMEOUT). On envoie le jeton de session quand il y
// en a un, la clé anonyme sinon — la fonction n'a pas besoin de savoir qui
// appelle (le payload est le même pour tous), mais elle exige un JWT valide.
export async function fetchRegion(lat: number, lon: number): Promise<Region> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || supabaseAnonKey;

  // AbortController + setTimeout plutôt qu'AbortSignal.timeout() : ce
  // raccourci n'existe pas dans le polyfill AbortController de React Native.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT);

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/get-region`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lat, lon }),
      signal: controller.signal,
    });
  } catch {
    throw new Error(timedOut ? 'délai dépassé (zone jamais calculée et serveurs OSM lents)' : 'serveur injoignable');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      // réponse non-JSON (proxy, 5xx brut) : on garde le code HTTP.
    }
    throw new Error(detail);
  }

  return deserializeRegion(await res.json());
}
