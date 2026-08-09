// Portage de la logique de js/main.js (état + règles métier), sans DOM/Leaflet :
// le rendu (carte, HUD, onglets) est fait de façon déclarative par les écrans
// React à partir de `state`, retourné par ce hook. Les fonctions ci-dessous
// mutent `state` (comme l'original) puis déclenchent un re-render via un
// compteur de révision — ça évite de retraduire toute la logique en state
// immuable et limite le risque de régression sur une logique dense.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';

import { fetchZone, fetchNeighborhoods } from '../logic/overpass';
import { buildGraph } from '../logic/graph';
import { assignNeighborhoods } from '../logic/neighborhoods';
import { Matcher, MAX_ACCURACY } from '../logic/matching';
import { makeProj, haversine } from '../logic/geo';
import * as storage from '../logic/storage';
import type { Progress } from '../logic/storage';
import { supabase } from '../lib/supabase';

const INTERP_STEP = 5; // m : ré-échantillonnage entre deux fix GPS successifs
const MAX_INTERP_GAP = 150; // m : au-delà, on suppose un saut GPS
const MAX_INTERP_TIME = 20000; // ms : au-delà, le fix précédent est trop vieux

const SPEED_LIMIT_KMH = 20;
const SPEED_STREAK_LIMIT = 2;

const SHADOW_MAX_AGE = 3600000;
const SHADOW_MAX_POINTS = 4000;
const SHADOW_MIN_DISTANCE = 80;

// Règles de chargement des zones (voir aussi MapScreen.tsx pour l'affichage
// par niveau de zoom) :
//  1. Au lancement, on ne charge que les environs immédiats du joueur.
//  2. En déplaçant la carte, on charge la zone visible (ce même RADIUS,
//     redéclenché autour du nouveau centre — voir maybeExpand).
//  3. Au-delà d'un certain dézoom (MapScreen.tsx, MAX_EXPAND_LATITUDE_DELTA),
//     on arrête de charger de nouvelles zones : à ce niveau de zoom, des
//     cercles de RADIUS m ne serviraient plus à rien visuellement et
//     enchaîner les requêtes Overpass serait du gaspillage.
const RADIUS = 500;
const BOUNDARY_MARGIN = 60;
const EXPAND_MARGIN = 200;
const EXPAND_COOLDOWN = 8000; // assez court pour explorer la carte à la main ;
                              // suffisant contre le spam GPS (~14 m parcourus en 8 s à pied)
// Règle 3/4 (voir plus haut) : au-delà de cette hauteur visible, on n'auto-
// charge plus rien au pan — centralisé ici (plutôt que dans MapScreen.tsx)
// pour que toute décision de chargement, y compris ce skip, passe par
// maybeExpand et soit donc journalisée de façon cohérente (voir logLoad).
const MAX_EXPAND_LATITUDE_DELTA = 0.03; // ~3.3 km de hauteur visible

export interface Fix {
  lat: number;
  lon: number;
  accuracy: number | null;
  t?: number;
}

export interface SessionState {
  newEdges: Set<string>;
  newInter: Set<string>;
  track: [number, number][];
  startedAt: number;
}

// Journal des tentatives de chargement de zone (voir logLoad) : pour le
// panneau de monitoring dev (LoadMonitorPanel.tsx), afin de voir exactement
// pourquoi un chargement a été rapide, lent, ou n'a rien fait.
export type LoadOutcome =
  | 'success'
  | 'error'
  | 'skip-in-progress'
  | 'skip-cooldown'
  | 'skip-covered'
  | 'skip-too-zoomed-out';

export interface LoadLogEntry {
  id: number;
  t: number; // Date.now() de la dernière occurrence
  trigger: 'init' | 'pan' | 'gps';
  outcome: LoadOutcome;
  detail?: string;
  durationMs?: number;
  edges?: number;
  junctions?: number;
  count: number; // occurrences consécutives identiques repliées (voir logLoad)
}

interface WalkediaState {
  graph: any;
  proj: ((lat: number, lon: number) => number[]) | null;
  center: [number, number] | null;
  centers: [number, number][];
  osmRaw: { nodes: Map<number, [number, number]>; ways: Map<number, any> };
  greenAreas: Map<number, { id: number; ring: [number, number][] }>;
  neighborhoods: Map<number, { id: number; name: string | null; ring: [number, number][] }>;
  junctionNeighborhood: Map<string, number | null>;
  expanding: boolean;
  lastExpandTry: number;
  progress: Progress;
  matcher: any;
  session: SessionState | null;
  position: { lat: number; lon: number; accuracy: number | null } | null;
  lastFix: Fix | null;
  speedStreak: number;
  shadow: { fixes: Fix[]; startedAt: number | null; prompted: boolean };
  toast: { msg: string; key: number } | null;
  ready: boolean; // progrès chargé depuis AsyncStorage
  mapReady: boolean; // graphe initial chargé
  startStatus: string;
  userId: string | null; // compte Supabase connecté, null si hors-ligne/déconnecté
  syncing: boolean;
  loadLog: LoadLogEntry[];
}

function freshState(): WalkediaState {
  return {
    graph: null,
    proj: null,
    center: null,
    centers: [],
    osmRaw: { nodes: new Map(), ways: new Map() },
    greenAreas: new Map(),
    neighborhoods: new Map(),
    junctionNeighborhood: new Map(),
    expanding: false,
    lastExpandTry: 0,
    progress: { edges: new Set(), junctions: new Set(), completedAt: {}, edgeMeters: 0, edgeVisits: {}, sessions: [] },
    matcher: null,
    session: null,
    position: null,
    lastFix: null,
    speedStreak: 0,
    shadow: { fixes: [], startedAt: null, prompted: false },
    toast: null,
    ready: false,
    mapReady: false,
    startStatus: '',
    userId: null,
    syncing: false,
    loadLog: [],
  };
}

// -------------------------------------------------------------- géométrie carrefour

function distToNearestCenter(state: WalkediaState, lat: number, lon: number) {
  let best = Infinity;
  for (const c of state.centers) best = Math.min(best, haversine([lat, lon], c));
  return best;
}

// Aligne un point de déclenchement (pan/GPS) sur une grille de la taille
// d'une zone (RADIUS) : sans ça, explorer une même petite zone à fort zoom
// (beaucoup de petits pans, chacun de plusieurs dizaines/centaines de m à
// l'écran) fait dériver le point exact à chaque fois et redéclenche un
// nouveau cercle de 800 m dès qu'on dépasse le seuil de distance — au lieu
// de réutiliser la zone déjà chargée juste à côté. La grille fait retomber
// les points proches sur le même centre, donc sur la même zone.
function snapToGrid(lat: number, lon: number, cellMeters: number): [number, number] {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110540;
  const gx = (Math.round((lon * kx) / cellMeters) * cellMeters) / kx;
  const gy = (Math.round((lat * ky) / cellMeters) * cellMeters) / ky;
  return [gy, gx];
}

function nearBoundary(state: WalkediaState, j: any) {
  return distToNearestCenter(state, j.lat, j.lon) > RADIUS - BOUNDARY_MARGIN;
}

// -------------------------------------------------------------- styles dérivés (pour l'UI)

export function edgeIsFound(state: WalkediaState, id: string) {
  const pendingReveal = state.session && state.session.newEdges.has(id);
  return state.progress.edges.has(id) && !pendingReveal;
}

export function junctionIsDone(state: WalkediaState, id: string) {
  return state.progress.junctions.has(id);
}

export interface NeighborhoodStat {
  id: number;
  name: string | null;
  total: number;
  done: number;
  pct: number;
  unlocked: boolean;
}

// Stats de complétion par quartier OSM, dérivées de junctionNeighborhood
// (voir rebuildGraph). Les carrefours sans quartier assigné (fréquent, voir
// logic/neighborhoods.js) ne contribuent à aucune ligne.
export function neighborhoodStats(state: WalkediaState): NeighborhoodStat[] {
  if (!state.graph) return [];
  const totals = new Map<number, { total: number; done: number }>();
  for (const j of state.graph.junctions.values()) {
    const nid = state.junctionNeighborhood.get(j.id);
    if (nid == null) continue;
    let t = totals.get(nid);
    if (!t) totals.set(nid, (t = { total: 0, done: 0 }));
    t.total++;
    if (junctionIsDone(state, j.id)) t.done++;
  }
  const stats: NeighborhoodStat[] = [];
  for (const [nid, t] of totals) {
    const n = state.neighborhoods.get(nid);
    const pct = t.total > 0 ? t.done / t.total : 0;
    stats.push({ id: nid, name: n?.name ?? null, total: t.total, done: t.done, pct, unlocked: pct >= 1 });
  }
  stats.sort((a, b) => b.pct - a.pct);
  return stats;
}

// ---------------------------------------------------------------------- hook

export function useWalkedia() {
  const stateRef = useRef<WalkediaState>(freshState());
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  const watchSub = useRef<Location.LocationSubscription | null>(null);
  const requestingLocation = useRef(false);

  const state = stateRef.current;

  const toast = useCallback(
    (msg: string, ms = 3500) => {
      const key = Date.now();
      state.toast = { msg, key };
      rerender();
      setTimeout(() => {
        if (state.toast && state.toast.key === key) {
          state.toast = null;
          rerender();
        }
      }, ms);
    },
    [rerender, state]
  );

  // Journalise une tentative de chargement de zone (voir maybeExpand/init),
  // pour le panneau de monitoring dev. Les résultats "skip-*" consécutifs et
  // identiques (même déclencheur/résultat) sont repliés en une seule ligne
  // avec un compteur plutôt que de spammer une ligne par tick GPS — sinon le
  // suivi GPS continu (≈1/s) noierait tout le reste du journal en quelques
  // secondes. "success"/"error" restent toujours des lignes distinctes.
  const loadLogSeq = useRef(0);
  const MAX_LOAD_LOG = 40;
  const COLLAPSIBLE_OUTCOMES = new Set<LoadOutcome>([
    'skip-in-progress',
    'skip-cooldown',
    'skip-covered',
    'skip-too-zoomed-out',
  ]);
  const logLoad = useCallback(
    (entry: Omit<LoadLogEntry, 'id' | 't' | 'count'>) => {
      const [last, ...rest] = state.loadLog;
      if (last && COLLAPSIBLE_OUTCOMES.has(entry.outcome) && last.trigger === entry.trigger && last.outcome === entry.outcome) {
        state.loadLog = [{ ...last, t: Date.now(), detail: entry.detail, count: last.count + 1 }, ...rest];
      } else {
        loadLogSeq.current += 1;
        state.loadLog = [{ id: loadLogSeq.current, t: Date.now(), count: 1, ...entry }, ...state.loadLog].slice(0, MAX_LOAD_LOG);
      }
      rerender();
    },
    [state, rerender]
  );

  // ---------------------------------------------------------- persistance

  useEffect(() => {
    storage.load().then((p: Progress) => {
      state.progress = p;
      state.ready = true;
      rerender();
    });
    return () => {
      if (watchSub.current) watchSub.current.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pousse la progression complète (édition sur place, pas de diff) vers
  // Supabase : la table `progress` a une seule ligne par utilisateur (upsert
  // sur user_id, voir supabase/migrations/0001_init.sql). Fire-and-forget
  // depuis `persist()` — un échec (hors-ligne, pas connecté) ne doit jamais
  // bloquer la sauvegarde locale, qui reste la source de vérité immédiate.
  const pushProgress = useCallback(async () => {
    if (!state.userId) return;
    try {
      await supabase.from('progress').upsert({
        user_id: state.userId,
        edges: [...state.progress.edges],
        junctions: [...state.progress.junctions],
        completed_at: state.progress.completedAt,
        edge_meters: state.progress.edgeMeters,
        edge_visits: state.progress.edgeVisits,
        updated_at: new Date().toISOString(),
      });
      if (state.progress.sessions.length) {
        await supabase.from('sessions').upsert(
          state.progress.sessions.map((s) => ({
            user_id: state.userId,
            started_at: new Date(s.start).toISOString(),
            ended_at: new Date(s.end).toISOString(),
            edges_count: s.edges,
            junctions_count: s.junctions,
            imported: !!s.imported,
          })),
          { onConflict: 'user_id,started_at,ended_at', ignoreDuplicates: true }
        );
      }
    } catch {
      // silencieux : la prochaine sauvegarde locale retentera la sync.
    }
  }, [state]);

  const persist = useCallback(() => {
    const p = storage.save(state.progress);
    pushProgress();
    return p;
  }, [state, pushProgress]);

  // À la connexion : fusionne la progression distante existante (autre
  // appareil) avec la locale par UNION plutôt que par écrasement, pour ne
  // jamais perdre de progression d'un côté ou de l'autre (voir plan —
  // §Fusion locale ↔ distant). `edgeMeters` n'a pas d'équivalent exact pour
  // l'union de deux ensembles d'arêtes dont on n'a pas forcément toute la
  // géométrie localement (zones différentes) : on garde le maximum des deux
  // comme approximation raisonnable (statistique d'affichage uniquement,
  // n'affecte pas les arêtes/carrefours acquis).
  const syncOnSignIn = useCallback(
    async (userId: string) => {
      state.userId = userId;
      state.syncing = true;
      rerender();
      try {
        const { data, error } = await supabase.from('progress').select('*').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (data) {
          for (const id of data.edges || []) state.progress.edges.add(id);
          for (const id of data.junctions || []) state.progress.junctions.add(id);
          for (const [jid, at] of Object.entries<number>(data.completed_at || {})) {
            const local = state.progress.completedAt[jid];
            state.progress.completedAt[jid] = local ? Math.min(local, at) : at;
          }
          state.progress.edgeMeters = Math.max(state.progress.edgeMeters, data.edge_meters || 0);
          for (const [eid, count] of Object.entries<number>(data.edge_visits || {})) {
            state.progress.edgeVisits[eid] = Math.max(state.progress.edgeVisits[eid] || 0, count);
          }
        }
        const { data: remoteSessions } = await supabase.from('sessions').select('*').eq('user_id', userId);
        if (remoteSessions?.length) {
          const known = new Set(state.progress.sessions.map((s) => `${s.start}|${s.end}`));
          for (const rs of remoteSessions) {
            const start = new Date(rs.started_at).getTime();
            const end = new Date(rs.ended_at).getTime();
            const key = `${start}|${end}`;
            if (!known.has(key)) {
              known.add(key);
              state.progress.sessions.push({
                start,
                end,
                edges: rs.edges_count,
                junctions: rs.junctions_count,
                imported: rs.imported,
              });
            }
          }
          state.progress.sessions.sort((a, b) => a.start - b.start);
        }
        await storage.save(state.progress);
        await pushProgress();
        toast('Progression synchronisée ✅');
      } catch (err: any) {
        toast('Synchronisation impossible : ' + err.message);
      } finally {
        state.syncing = false;
        rerender();
      }
    },
    [state, pushProgress, rerender, toast]
  );

  const signOutLocally = useCallback(() => {
    state.userId = null;
    rerender();
  }, [state, rerender]);

  // -------------------------------------------------------- zones & graphe

  const mergeOsm = useCallback(
    (osm: { nodes: Map<number, [number, number]>; ways: any[] }) => {
      for (const [id, c] of osm.nodes) state.osmRaw.nodes.set(id, c);
      for (const w of osm.ways) state.osmRaw.ways.set(w.id, w);
    },
    [state]
  );

  const mergeGreenAreas = useCallback(
    (areas: { id: number; ring: [number, number][] }[]) => {
      for (const a of areas) state.greenAreas.set(a.id, a);
    },
    [state]
  );

  const mergeNeighborhoods = useCallback(
    (areas: { id: number; name: string | null; ring: [number, number][] }[]) => {
      for (const a of areas) state.neighborhoods.set(a.id, a);
      // Les quartiers arrivent en tâche de fond (voir loadNeighborhoods),
      // potentiellement après que rebuildGraph a déjà tourné sans eux : on
      // réassigne ici pour ne pas attendre le prochain chargement de zone.
      if (state.graph) state.junctionNeighborhood = assignNeighborhoods(state.graph.junctions, state.neighborhoods);
    },
    [state]
  );

  // Chargement des quartiers en arrière-plan, jamais attendu ni bloquant :
  // une donnée de confort pour les stats de profil, pas pour le cœur du jeu
  // (voir commentaire dans overpass.js). Best-effort : une erreur ou une
  // lenteur ici reste totalement invisible pour le joueur.
  const loadNeighborhoods = useCallback(
    (lat: number, lon: number) => {
      fetchNeighborhoods(lat, lon, RADIUS)
        .then((areas) => {
          mergeNeighborhoods(areas);
          rerender();
        })
        .catch(() => {});
    },
    [mergeNeighborhoods, rerender]
  );

  // buildGraph rend la main à la boucle d'événements entre ses étapes
  // coûteuses (voir graph.js) pour ne pas geler la carte pendant une
  // reconstruction ; on l'attend donc ici plutôt que de bloquer en synchrone.
  // L'assignation carrefour -> quartier est recalculée juste après : elle ne
  // dépend que du graphe et des quartiers connus (tous deux figés en dehors
  // d'un chargement/extension de zone), jamais d'un tick GPS.
  const rebuildGraph = useCallback(async () => {
    state.graph = await buildGraph(
      { nodes: state.osmRaw.nodes, ways: [...state.osmRaw.ways.values()] },
      [...state.greenAreas.values()].map((a) => a.ring)
    );
    state.junctionNeighborhood = assignNeighborhoods(state.graph.junctions, state.neighborhoods);
  }, [state]);

  // Complétion : vérifie un carrefour, retourne true s'il vient d'être complété.
  const checkJunction = useCallback(
    (j: any) => {
      if (state.progress.junctions.has(j.id)) return false;
      if (nearBoundary(state, j)) return false;
      for (const id of j.requiredEdgeIds) {
        if (!state.progress.edges.has(id)) return false;
      }
      state.progress.junctions.add(j.id);
      state.progress.completedAt[j.id] = Date.now();
      return true;
    },
    [state]
  );

  const sweepCompletions = useCallback(
    (announce: boolean) => {
      let pruned = 0;
      for (const id of [...state.progress.junctions]) {
        if (state.graph.junctions.has(id)) continue;
        const [lat, lon] = id.split(',').map(Number);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (distToNearestCenter(state, lat, lon) > RADIUS - BOUNDARY_MARGIN) continue;
        state.progress.junctions.delete(id);
        delete state.progress.completedAt[id];
        pruned++;
      }
      let gained = 0;
      for (const j of state.graph.junctions.values()) {
        if (checkJunction(j)) gained++;
      }
      if (gained > 0 || pruned > 0) {
        persist();
        if (announce && gained > 0) toast(`+${gained} carrefour(s) complété(s) !`);
      }
      return gained;
    },
    [state, checkJunction, persist, toast]
  );

  // `announceSkip` : quand l'appel vient d'une action explicite de
  // l'utilisateur (pan sur la carte), on explique pourquoi rien ne se
  // charge le cas échéant (cooldown, zone déjà couverte) au lieu de rester
  // muet — sinon indiscernable d'un bug. Le suivi GPS continu (onFix, un
  // appel par seconde) reste silencieux dans ces cas pour ne pas spammer.
  // `trigger`/`latitudeDelta` : uniquement pour la journalisation (voir
  // logLoad) et le seuil de dézoom (règle 3/4) — le suivi GPS (trigger
  // 'gps') n'a pas de notion de zoom de carte, donc pas de latitudeDelta,
  // et n'est jamais coupé par MAX_EXPAND_LATITUDE_DELTA.
  const maybeExpand = useCallback(
    async (
      rawLat: number,
      rawLon: number,
      opts: { trigger?: 'pan' | 'gps'; latitudeDelta?: number; announceSkip?: boolean } = {}
    ) => {
      const trigger = opts.trigger ?? 'gps';
      if (opts.latitudeDelta != null && opts.latitudeDelta > MAX_EXPAND_LATITUDE_DELTA) {
        logLoad({ trigger, outcome: 'skip-too-zoomed-out', detail: `${(opts.latitudeDelta * 110.54).toFixed(1)} km de hauteur visible` });
        if (opts.announceSkip) toast('Trop dézoomé pour charger de nouvelles zones.');
        return;
      }
      const [lat, lon] = snapToGrid(rawLat, rawLon, RADIUS);
      const now = Date.now();
      if (state.expanding) {
        logLoad({ trigger, outcome: 'skip-in-progress' });
        if (opts.announceSkip) toast('Chargement déjà en cours…');
        return;
      }
      const wait = EXPAND_COOLDOWN - (now - state.lastExpandTry);
      if (wait > 0) {
        logLoad({ trigger, outcome: 'skip-cooldown', detail: `encore ${Math.ceil(wait / 1000)}s` });
        if (opts.announceSkip) toast(`Nouvelle zone : réessaie dans ${Math.ceil(wait / 1000)}s…`);
        return;
      }
      const dist = distToNearestCenter(state, lat, lon);
      if (dist <= RADIUS - EXPAND_MARGIN) {
        logLoad({ trigger, outcome: 'skip-covered', detail: `${Math.round(dist)} m du centre le plus proche` });
        if (opts.announceSkip) toast('Cette zone est déjà couverte.');
        return;
      }
      state.expanding = true;
      state.lastExpandTry = now;
      const startedAt = Date.now();
      try {
        const { osm, greenAreas } = await fetchZone(lat, lon, RADIUS);
        mergeOsm(osm);
        mergeGreenAreas(greenAreas);
        state.centers.push([lat, lon]);
        await rebuildGraph();
        if (state.matcher) state.matcher = new Matcher(state.graph, state.proj, state.matcher);
        sweepCompletions(false);
        rerender();
        toast('Nouvelle zone chargée 🗺️');
        loadNeighborhoods(lat, lon);
        logLoad({
          trigger,
          outcome: 'success',
          durationMs: Date.now() - startedAt,
          edges: state.graph.edges.size,
          junctions: state.graph.junctions.size,
        });
      } catch (err: any) {
        toast('Extension de zone impossible : ' + err.message);
        logLoad({ trigger, outcome: 'error', detail: err.message, durationMs: Date.now() - startedAt });
      } finally {
        state.expanding = false;
      }
    },
    [state, mergeOsm, mergeGreenAreas, loadNeighborhoods, rebuildGraph, sweepCompletions, rerender, toast, logLoad]
  );

  // ------------------------------------------------------------- suivi GPS

  const onFixRef = useRef<((lat: number, lon: number, accuracy: number | null, t: number, speed: number | null) => void) | undefined>(
    undefined
  );

  function interpolatedFixes(prev: Fix | null, cur: Fix): Fix[] {
    if (!prev) return [cur];
    const dist = haversine([prev.lat, prev.lon], [cur.lat, cur.lon]);
    if (dist <= INTERP_STEP || dist > MAX_INTERP_GAP) return [cur];
    if (prev.t != null && cur.t != null && cur.t - prev.t > MAX_INTERP_TIME) return [cur];

    const steps = Math.round(dist / INTERP_STEP);
    const fixes: Fix[] = [];
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      fixes.push({
        lat: prev.lat + (cur.lat - prev.lat) * f,
        lon: prev.lon + (cur.lon - prev.lon) * f,
        accuracy: Math.max(prev.accuracy || 0, cur.accuracy || 0),
      });
    }
    fixes.push(cur);
    return fixes;
  }

  function estimateSpeedKmh(prev: Fix | null, cur: Fix, nativeSpeed: number | null) {
    if (cur.accuracy != null && cur.accuracy > MAX_ACCURACY) return null;
    if (nativeSpeed != null && Number.isFinite(nativeSpeed) && nativeSpeed >= 0) return nativeSpeed * 3.6;
    if (!prev || prev.t == null || cur.t == null) return null;
    const dt = (cur.t - prev.t) / 1000;
    if (dt < 1 || dt > MAX_INTERP_TIME / 1000) return null;
    const dist = haversine([prev.lat, prev.lon], [cur.lat, cur.lon]);
    return (dist / dt) * 3.6;
  }

  const bufferShadowFix = useCallback(
    (lat: number, lon: number, accuracy: number | null, t: number) => {
      if (accuracy != null && accuracy > MAX_ACCURACY) return;
      const fixes = state.shadow.fixes;
      fixes.push({ lat, lon, accuracy, t });
      const cutoff = t - SHADOW_MAX_AGE;
      while (fixes.length && (fixes[0].t ?? 0) < cutoff) fixes.shift();
      while (fixes.length > SHADOW_MAX_POINTS) fixes.shift();
      state.shadow.startedAt = fixes.length ? fixes[0].t ?? null : null;
    },
    [state]
  );

  const clearShadow = useCallback(() => {
    state.shadow.fixes = [];
    state.shadow.startedAt = null;
    state.shadow.prompted = false;
  }, [state]);

  function shadowDistance(fixes: Fix[]) {
    let d = 0;
    for (let i = 1; i < fixes.length; i++) d += haversine([fixes[i - 1].lat, fixes[i - 1].lon], [fixes[i].lat, fixes[i].lon]);
    return d;
  }

  // Rejoue le tampon de marche hors session à travers un matcher temporaire.
  const importShadowWalk = useCallback(async () => {
    const { fixes, startedAt } = state.shadow;
    const matcher = new Matcher(state.graph, state.proj);
    const newEdges = new Set<string>();
    const newInter = new Set<string>();
    let prevFix: Fix | null = null;
    for (const cur of fixes) {
      const prev = cur.accuracy != null && cur.accuracy > MAX_ACCURACY ? null : prevFix;
      for (const fix of interpolatedFixes(prev, cur)) {
        for (const edgeId of matcher.feed(fix.lat, fix.lon, fix.accuracy)) {
          state.progress.edgeVisits[edgeId] = (state.progress.edgeVisits[edgeId] || 0) + 1;
          if (state.progress.edges.has(edgeId)) continue;
          state.progress.edges.add(edgeId);
          state.progress.edgeMeters += state.graph.edges.get(edgeId).length;
          newEdges.add(edgeId);
          for (const jid of state.graph.edgeJunctions.get(edgeId) || []) {
            const j = state.graph.junctions.get(jid);
            if (j && checkJunction(j)) newInter.add(jid);
          }
        }
      }
      if (cur.accuracy == null || cur.accuracy <= MAX_ACCURACY) prevFix = cur;
    }

    state.progress.sessions.push({
      start: startedAt as number,
      end: fixes[fixes.length - 1].t as number,
      edges: newEdges.size,
      junctions: newInter.size,
      imported: true,
    });
    await persist();
    rerender();
    toast(`Marche importée : ${newEdges.size} nouveau(x) tronçon(s), ${newInter.size} carrefour(s) complété(s).`, 6000);
    clearShadow();
  }, [state, checkJunction, persist, rerender, toast, clearShadow]);

  // Propose l'import dès qu'une marche hors session devient significative
  // (≥ SHADOW_MIN_DISTANCE), sans attendre que l'utilisateur démarre une
  // nouvelle session : c'est la détection qui déclenche la proposition, pas
  // une action explicite sur un bouton. `prompted` évite de redemander pour
  // la même marche tant qu'elle n'a pas été traitée (importée ou annulée).
  const maybeImportShadowWalk = useCallback(() => {
    const { fixes, startedAt, prompted } = state.shadow;
    if (prompted || fixes.length < 2 || startedAt == null) return;
    const dist = shadowDistance(fixes);
    if (dist < SHADOW_MIN_DISTANCE) return; // pas encore assez significatif, on continue à accumuler

    state.shadow.prompted = true;
    const mins = Math.max(1, Math.round(((fixes[fixes.length - 1].t as number) - startedAt) / 60000));
    Alert.alert(
      'Marche détectée',
      `Marche détectée (~${mins} min, ${Math.round(dist)} m).\nImporter ce trajet dans ton historique ?`,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => clearShadow() },
        { text: 'Importer', onPress: () => importShadowWalk() },
      ]
    );
  }, [state, clearShadow, importShadowWalk]);

  const onFix = useCallback(
    (lat: number, lon: number, accuracy: number | null, t: number, speed: number | null) => {
      // position affichée
      state.position = { lat, lon, accuracy };
      maybeExpand(lat, lon, { trigger: 'gps' });

      if (!state.session) {
        bufferShadowFix(lat, lon, accuracy, t);
        maybeImportShadowWalk();
        rerender();
        return;
      }
      state.session.track.push([lat, lon]);

      const cur: Fix = { lat, lon, accuracy, t };
      const prev = accuracy != null && accuracy > MAX_ACCURACY ? null : state.lastFix;

      const speedKmh = estimateSpeedKmh(prev, cur, speed);
      if (speedKmh != null && speedKmh > SPEED_LIMIT_KMH) {
        state.speedStreak++;
        if (state.speedStreak >= SPEED_STREAK_LIMIT) {
          state.speedStreak = 0;
          toast(`Session arrêtée : vitesse trop élevée (${Math.round(speedKmh)} km/h) pour de la marche.`, 6000);
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          endSessionRef.current?.();
          return;
        }
      } else {
        state.speedStreak = 0;
      }

      const fixes = interpolatedFixes(prev, cur);
      if (accuracy == null || accuracy <= MAX_ACCURACY) state.lastFix = cur;

      let anyChange = false;
      for (const fix of fixes) {
        for (const edgeId of state.matcher.feed(fix.lat, fix.lon, fix.accuracy)) {
          // Compteur de passages (heatmap) : incrémenté à chaque tronçon validé
          // par le matcher, y compris les tronçons déjà découverts (revisite).
          // matcher.feed() ne renvoie un id qu'une fois par arête et par
          // session (voir Matcher.traversed dans matching.js), donc pas de
          // risque de sur-comptage par spam de fix GPS.
          state.progress.edgeVisits[edgeId] = (state.progress.edgeVisits[edgeId] || 0) + 1;
          if (state.progress.edges.has(edgeId)) continue;
          state.progress.edges.add(edgeId);
          state.progress.edgeMeters += state.graph.edges.get(edgeId).length;
          state.session.newEdges.add(edgeId);
          anyChange = true;
          for (const jid of state.graph.edgeJunctions.get(edgeId) || []) {
            const j = state.graph.junctions.get(jid);
            if (j && checkJunction(j)) {
              state.session.newInter.add(jid);
              toast('Carrefour complété ! +1 point 🎉');
            }
          }
          persist();
        }
      }
      rerender();
      if (!anyChange) {
        // le déplacement seul (trackLine, position) doit quand même se voir
      }
    },
    [state, maybeExpand, bufferShadowFix, maybeImportShadowWalk, rerender, checkJunction, persist, toast]
  );
  onFixRef.current = onFix;

  // ---------------------------------------------------------------- session

  const startSession = useCallback(() => {
    // La proposition d'import d'une marche oubliée est gérée indépendamment,
    // dès qu'elle est détectée (voir maybeImportShadowWalk) : démarrer une
    // session ne doit pas attendre ni redéclencher cette décision.
    state.matcher = new Matcher(state.graph, state.proj);
    state.lastFix = null;
    state.speedStreak = 0;
    state.session = { newEdges: new Set(), newInter: new Set(), track: [], startedAt: Date.now() };
    rerender();
    toast('Session démarrée — bonne exploration !');
  }, [state, rerender, toast]);

  const endSession = useCallback(() => {
    if (!state.session) return;
    const { newEdges, newInter, startedAt } = state.session;
    state.session = null;
    state.matcher = null;
    state.lastFix = null;

    state.progress.sessions.push({ start: startedAt, end: Date.now(), edges: newEdges.size, junctions: newInter.size });
    persist();

    const mins = Math.round((Date.now() - startedAt) / 60000);
    toast(`Session terminée (${mins} min) : ${newEdges.size} nouveau(x) tronçon(s), ${newInter.size} carrefour(s) complété(s).`, 6000);
    rerender();
  }, [state, persist, toast, rerender]);

  const endSessionRef = useRef(endSession);
  endSessionRef.current = endSession;

  // -------------------------------------------------------------- démarrage

  const startWatch = useCallback(async () => {
    if (watchSub.current) return;
    watchSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (pos) => {
        onFixRef.current?.(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp, pos.coords.speed);
      }
    );
  }, []);

  const init = useCallback(
    async (lat: number, lon: number) => {
      if (state.mapReady) return;
      state.startStatus = 'Chargement du réseau piéton…';
      rerender();
      let osm, greenAreas;
      const startedAt = Date.now();
      try {
        ({ osm, greenAreas } = await fetchZone(lat, lon, RADIUS));
      } catch (err: any) {
        state.startStatus = 'Impossible de charger les données OSM : ' + err.message;
        rerender();
        logLoad({ trigger: 'init', outcome: 'error', detail: err.message, durationMs: Date.now() - startedAt });
        return;
      }

      state.center = [lat, lon];
      state.proj = makeProj(lat);
      mergeOsm(osm);
      mergeGreenAreas(greenAreas);
      state.centers.push([lat, lon]);
      await rebuildGraph();
      sweepCompletions(false);
      state.mapReady = true;
      rerender();
      toast(`${state.graph.edges.size} tronçons · ${state.graph.junctions.size} carrefours dans la zone`);
      logLoad({
        trigger: 'init',
        outcome: 'success',
        durationMs: Date.now() - startedAt,
        edges: state.graph.edges.size,
        junctions: state.graph.junctions.size,
      });

      await startWatch();
      loadNeighborhoods(lat, lon);
    },
    [state, mergeOsm, mergeGreenAreas, loadNeighborhoods, rebuildGraph, sweepCompletions, rerender, toast, startWatch, logLoad]
  );

  const requestLocationAndInit = useCallback(async () => {
    // Garde-fou : le bouton de l'écran de démarrage reste actif pendant le
    // déclenchement automatique à l'ouverture, un double appel (tap pendant
    // que la géoloc tourne déjà) ne doit pas relancer toute la séquence.
    if (requestingLocation.current || state.mapReady) return;
    requestingLocation.current = true;
    state.startStatus = 'Recherche de ta position…';
    rerender();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        state.startStatus =
          "Accès à la position refusé. Autorise la position pour Walkedia dans les réglages du téléphone, puis relance l'app.";
        rerender();
        return;
      }
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        timeout,
      ]);
      await init(pos.coords.latitude, pos.coords.longitude);
    } catch (err: any) {
      state.startStatus =
        err && err.message === 'timeout'
          ? 'Délai dépassé pour obtenir la position. Réessaie (le premier fix GPS peut être lent en intérieur).'
          : 'Position indisponible. Vérifie que la localisation du téléphone est activée et réessaie, de préférence en extérieur.';
      rerender();
    } finally {
      requestingLocation.current = false;
    }
  }, [state, rerender, init]);

  // ------------------------------------------------------------- debug/simu

  // Concatène quelques arêtes du graphe à partir d'un nœud de départ pour
  // simuler un déplacement à pied, ré-échantillonné tous les INTERP_STEP m.
  const buildSimPath = useCallback((): [number, number][] => {
    const g = state.graph;
    if (!g) return [];
    const first = [...g.edges.values()][0];
    if (!first) return [];
    let coords: [number, number][] = first.coords.slice();
    const used = new Set([first.id]);
    let endKey = first.b;
    for (let i = 0; i < 5; i++) {
      const node = g.nodes.get(endKey);
      if (!node) break;
      const next = node.edgeIds.map((id: string) => g.edges.get(id)).find((e: any) => e && !used.has(e.id));
      if (!next) break;
      used.add(next.id);
      let nc: [number, number][] = next.coords.slice();
      if (next.a === endKey) {
        endKey = next.b;
      } else {
        nc = nc.slice().reverse();
        endKey = next.a;
      }
      coords = coords.concat(nc.slice(1));
    }
    return coords;
  }, [state]);

  function resamplePath(coords: [number, number][], step: number): [number, number][] {
    const out: [number, number][] = [];
    let carry = 0;
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1];
      const b = coords[i];
      const segLen = haversine(a, b);
      if (segLen === 0) continue;
      let d = carry;
      while (d < segLen) {
        const f = d / segLen;
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        d += step;
      }
      carry = d - segLen;
    }
    out.push(coords[coords.length - 1]);
    return out;
  }

  // Injecte une série de fix GPS synthétiques le long d'arêtes du graphe
  // (équivalent de window.__walkedia.feedFix côté PWA) : permet de valider
  // tout le pipeline (matching -> progression -> HUD) sans marcher.
  const simulateWalk = useCallback(() => {
    if (!state.mapReady) return;
    const path = resamplePath(buildSimPath(), INTERP_STEP);
    if (path.length < 2) {
      toast('Pas assez de réseau chargé pour simuler.');
      return;
    }
    let i = 0;
    let simT = Date.now();
    const stepMs = (INTERP_STEP / 1.4) * 1000; // ~1.4 m/s, allure de marche
    const timer = setInterval(() => {
      if (i >= path.length) {
        clearInterval(timer);
        return;
      }
      const [lat, lon] = path[i];
      simT += stepMs;
      onFixRef.current?.(lat, lon, 8, simT, null);
      i++;
    }, 180);
  }, [state, buildSimPath, toast]);

  const recenter = useCallback(() => {
    if (state.position) return [state.position.lat, state.position.lon] as [number, number];
    return state.center;
  }, [state]);

  return {
    state,
    actions: {
      requestLocationAndInit,
      startSession,
      endSession,
      simulateWalk,
      recenter,
      maybeExpand,
      syncOnSignIn,
      signOutLocally,
    },
  };
}
