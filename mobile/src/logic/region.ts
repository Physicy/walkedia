// Chargement d'une zone depuis l'Edge Function `get-region` (cache partagé
// entre joueurs, voir supabase/functions/get-region/index.ts). La forme du
// graphe reçu et sa fusion dans le graphe cumulé sont dans regionGraph.ts —
// ici, uniquement l'appel réseau et ses modes d'échec.
//
// Deux appels, pour deux besoins qui n'ont pas la même valeur :
//   - `fetchRegion` : le joueur a besoin de cette zone (il marche dedans, il
//     vient de la demander à la main). Elle est calculée si elle manque, et
//     ça peut prendre du temps.
//   - `fetchCachedRegion` : confort d'affichage (poser des pastilles sur la
//     vue au dézoom). Si la zone n'est pas déjà calculée, on repart sans
//     rien plutôt que de faire attendre. Mesuré sur appareil avant cette
//     séparation : un remplissage de vue a attendu 691 s, dont 8 timeouts
//     Overpass de 60 s, pour ne rapporter que 6 zones sur 26.

import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase';
import { deserializeRegion, type Region } from './regionGraph';
import i18n from '../i18n';

// Plafond côté client : sur une zone jamais calculée, la fonction fait tout
// le travail en synchrone (Overpass + construction), et les miroirs Overpass
// publics peuvent mettre très longtemps — mieux vaut échouer proprement avec
// un message que de laisser le chargement pendre indéfiniment.
const REQUEST_TIMEOUT = 90000;

// Une lecture de cache est une requête à la base, rien d'autre : mesurée
// entre 0,4 et 2,3 s bout en bout, démarrage à froid de la fonction compris.
// Au-delà de ce plafond, ce n'est plus une lecture de cache, c'est un
// incident réseau — et un affichage de confort ne l'attend pas.
const CACHE_REQUEST_TIMEOUT = 8000;

export interface FetchOptions {
  // Permet d'abandonner un chargement devenu inutile (le joueur a redéplacé
  // la carte). Le calcul éventuellement lancé côté serveur, lui, va au bout
  // et remplit le cache : l'abandon ne gâche rien, il rend la main.
  signal?: AbortSignal;
}

interface Reponse {
  region: Region | null; // null = zone pas encore calculée (cacheOnly)
}

async function demander(
  lat: number,
  lon: number,
  cacheOnly: boolean,
  timeoutMs: number,
  opts: FetchOptions
): Promise<Reponse> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || supabaseAnonKey;

  // AbortController + setTimeout plutôt qu'AbortSignal.timeout() : ce
  // raccourci n'existe pas dans le polyfill AbortController de React Native.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // Le signal de l'appelant s'ajoute au nôtre. `addEventListener` n'existe
  // pas sur tous les polyfills d'AbortSignal, d'où le repli sur `onabort`.
  const relayer = () => controller.abort();
  const externe = opts.signal;
  if (externe) {
    if (externe.aborted) controller.abort();
    else if (typeof externe.addEventListener === 'function') externe.addEventListener('abort', relayer);
    else externe.onabort = relayer;
  }

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/get-region`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(cacheOnly ? { lat, lon, cacheOnly: true } : { lat, lon }),
      signal: controller.signal,
    });
  } catch {
    if (externe?.aborted && !timedOut) throw new Error('abandon');
    throw new Error(
      timedOut ? i18n.t('errors.timeoutSlowServers') : i18n.t('errors.serverUnreachable')
    );
  } finally {
    clearTimeout(timer);
    if (externe && typeof externe.removeEventListener === 'function') {
      externe.removeEventListener('abort', relayer);
    }
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

  const payload = await res.json();
  // Réponse « pas en cache » : un 200 avec un marqueur, pas une erreur. Ce
  // n'est pas un échec, c'est une zone qui n'existe pas encore.
  if (payload?.miss) return { region: null };
  return { region: deserializeRegion(payload) };
}

// Calcule la zone si elle manque. Pour ce dont le joueur a besoin.
export async function fetchRegion(lat: number, lon: number, opts: FetchOptions = {}): Promise<Region> {
  const { region } = await demander(lat, lon, false, REQUEST_TIMEOUT, opts);
  return region!; // sans cacheOnly, la fonction calcule ou échoue
}

// Ne sert que ce qui est déjà calculé. `null` si la zone n'existe pas encore.
export async function fetchCachedRegion(lat: number, lon: number, opts: FetchOptions = {}): Promise<Region | null> {
  const { region } = await demander(lat, lon, true, CACHE_REQUEST_TIMEOUT, opts);
  return region;
}
