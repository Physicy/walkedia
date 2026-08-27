// Portage de la logique de js/main.js (état + règles métier), sans DOM/Leaflet :
// le rendu (carte, HUD, onglets) est fait de façon déclarative par les écrans
// React à partir de `state`, retourné par ce hook. Les fonctions ci-dessous
// mutent `state` (comme l'original) puis déclenchent un re-render via un
// compteur de révision — ça évite de retraduire toute la logique en state
// immuable et limite le risque de régression sur une logique dense.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';

import { fetchRegion } from '../logic/region';
import { emptyGraph, mergeGraph } from '../logic/regionGraph';
import type { Graph, Neighborhood, Region } from '../logic/regionGraph';
import { Matcher, MAX_ACCURACY } from '../logic/matching';
import { makeProj, haversine, lineLength } from '../logic/geo';
import * as storage from '../logic/storage';
import type { Progress } from '../logic/storage';
import { loadPrefs, savePrefs } from '../logic/prefs';
import * as discovered from '../logic/discovered';
import type { Discovered } from '../logic/discovered';
import { supabase } from '../lib/supabase';
import {
  consumeBackgroundBuffer,
  isBackgroundTrackingActive,
  startBackgroundTracking,
  stopBackgroundTracking,
} from '../logic/backgroundLocation';

const INTERP_STEP = 5; // m : ré-échantillonnage entre deux fix GPS successifs
const MAX_INTERP_GAP = 150; // m : au-delà, on suppose un saut GPS
const MAX_INTERP_TIME = 20000; // ms : au-delà, le fix précédent est trop vieux

const SPEED_LIMIT_KMH = 20;
const SPEED_STREAK_LIMIT = 2;

// Auto-démarrage de session en avant-plan (règle 2, voir onFix) : distance
// courte accumulée hors session avant de démarrer automatiquement — pas
// besoin d'attendre/demander comme l'ancien mécanisme "shadow walk" en
// mémoire, qu'il remplace. AUTO_START_MAX_GAP évite qu'un mouvement
// accumulé il y a longtemps (le joueur s'est arrêté puis reprend bien plus
// tard) ne déclenche sur un simple pas isolé.
const AUTO_START_DISTANCE = 40; // m
const AUTO_START_MAX_GAP = 60000; // ms

// Règles de chargement des zones (voir aussi MapScreen.tsx pour l'affichage
// par niveau de zoom) :
//  1. Au lancement, on ne charge que les environs immédiats du joueur.
//  2. En déplaçant la carte, on charge la zone visible (ce même RADIUS,
//     redéclenché autour du nouveau centre — voir maybeExpand).
//  3. Au-delà d'un certain dézoom (MapScreen.tsx, MAX_EXPAND_LATITUDE_DELTA),
//     on arrête de charger de nouvelles zones : à ce niveau de zoom, des
//     cercles de RADIUS m ne serviraient plus à rien visuellement et
//     enchaîner les requêtes serait du gaspillage.
//
// RADIUS est le pas de la grille de centres : il DOIT rester identique à
// celui de l'Edge Function get-region, qui s'en sert pour arrondir la
// position reçue et en faire sa clé de cache (une valeur différente ici
// ferait manquer le cache à chaque appel).
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

// Remplissage en grille au dézoom (mode cluster, voir MapScreen.tsx
// CLUSTER_LATITUDE_DELTA) : au lieu de n'avoir des clusters que sur les
// zones déjà chargées ailleurs (typiquement autour d'où le joueur a marché),
// on complète activement la zone visible avec plusieurs zones de RADIUS m.
// Le nombre de zones nécessaires croît en O(largeur×hauteur) — sans
// plafond ni cadence propre, ça enchaînerait des dizaines de requêtes
// Overpass simultanées et ça irait à l'encontre du but (ne pas ralentir).
// Chargées séquentiellement (une seule reconstruction de graphe à la fin,
// pas une par zone), plafonnées par lot, avec leur propre cooldown — pas
// celui d'EXPAND_COOLDOWN, pensé pour un tout autre usage (GPS/pan ponctuel).
const MAX_GRID_LOAD_LATITUDE_DELTA = 0.06; // ~6.6 km — au-delà, trop de zones pour rester raisonnable
const GRID_BATCH_MAX_ZONES = 16;
const GRID_LOAD_COOLDOWN = 5000; // ms

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

// Un carrefour complété, en attente d'être montré par le voile plein écran
// (voir MapChrome/SessionSummary — anciennement une simple ligne de toast).
// File d'attente plutôt qu'un singleton : le map matching peut créditer
// plusieurs tronçons d'un même lot de fixes GPS interpolés (voir onFix) et
// donc compléter plusieurs carrefours d'un coup ; ils se montrent alors l'un
// après l'autre plutôt que d'en perdre.
export interface PointGagne {
  junctionId: string;
  numero: number;
  // Combien des rues de ce carrefour étaient inédites (jamais marchées avant
  // cette session), sur son nombre total de branches requises. Capturé au
  // moment de la complétion plutôt que recalculé à l'affichage : la session
  // peut se terminer (arrêt automatique) entre les deux, et `newEdges`
  // disparaît avec elle.
  nouvelles: number;
  total: number;
}

// Résumé affiché à la fin d'une session — remplace le toast : dit ce qui a
// été gagné ET ce qui ne comptait pas (voir SessionSummary.tsx), ce qu'une
// ligne de toast ne peut pas faire. `raisonVitesse` distingue un arrêt
// automatique (le joueur roulait) d'un arrêt volontaire.
export interface SortieResume {
  edges: number;
  junctions: number;
  km: number;
  minutes: number;
  raisonVitesse: number | null;
}

// Marche détectée en arrière-plan pendant que l'app était fermée (voir
// checkBackgroundImport) — remplace l'ancienne `Alert` système : une boîte
// native ne peut ni montrer ce que la marche rapporterait ni être stylée.
export interface MarcheDetectee {
  distanceM: number;
  minutes: number;
  fixes: Fix[];
  startedAt: number;
}

// Résumé de la fusion à la connexion (voir syncOnSignIn) : la partie la plus
// rassurante du backend — union des deux relevés, rien n'est écrasé — mais
// invisible tant qu'elle n'a pas son propre écran. `communes` se déduit par
// inclusion-exclusion (local + compte - total) plutôt que d'être compté à
// part : le calcul est fait une fois, ici, sur les tailles avant/après fusion.
// Montré seulement quand les deux côtés avaient déjà quelque chose à fusionner
// — sinon ce n'est pas une fusion, juste une première synchronisation.
export interface FusionResume {
  local: number;
  compte: number;
  total: number;
  communes: number;
}

// Nature du statut affiché par StartScreen.tsx (voir startStatusKind) : le
// texte de `startStatus`, lui, est traduit et ne peut donc plus servir à
// deviner la nature de la panne.
export type StartStatusKind = 'loading' | 'permissionDenied' | 'error';

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
  trigger: 'init' | 'pan' | 'gps' | 'batch';
  outcome: LoadOutcome;
  detail?: string;
  durationMs?: number;
  edges?: number;
  junctions?: number;
  count: number; // occurrences consécutives identiques repliées (voir logLoad)
}

interface WalkediaState {
  graph: Graph | null;
  proj: ((lat: number, lon: number) => number[]) | null;
  center: [number, number] | null;
  centers: [number, number][];
  neighborhoods: Map<number, Neighborhood>;
  junctionNeighborhood: Map<string, number | null>;
  // Géométrie de ce qui a déjà été découvert, persistée localement (voir
  // logic/discovered.ts) : permet de dessiner l'historique du joueur dès
  // l'ouverture, sans attendre qu'une zone revienne du serveur.
  discovered: Discovered;
  expanding: boolean;
  lastExpandTry: number;
  gridLoading: boolean;
  lastGridLoadTry: number;
  progress: Progress;
  matcher: any;
  session: SessionState | null;
  position: { lat: number; lon: number; accuracy: number | null } | null;
  lastFix: Fix | null;
  speedStreak: number;
  // Accumulateur de mouvement hors session (voir onFix, règle "auto-
  // démarrage en avant-plan") : distance roulante depuis le dernier fix
  // plausible, remis à zéro dès qu'une session démarre ou qu'un trou trop
  // long survient entre deux fixes.
  idleMovement: { lat: number; lon: number; t: number; distance: number } | null;
  toast: { msg: string; key: number } | null;
  pointsGagnes: PointGagne[];
  sortieResume: SortieResume | null;
  marcheDetectee: MarcheDetectee | null;
  ready: boolean; // progrès chargé depuis AsyncStorage
  mapReady: boolean; // graphe initial chargé
  startStatus: string;
  // Séparé du texte lui-même (qui est traduit, donc son contenu ne peut pas
  // servir à deviner la nature du statut — voir StartScreen.tsx, dont
  // `lirePanne` distinguait « refus de permission » d'une autre panne par
  // regex sur le français).
  startStatusKind: StartStatusKind;
  userId: string | null; // compte Supabase connecté, null si hors-ligne/déconnecté
  syncing: boolean;
  loadLog: LoadLogEntry[];
  backgroundTrackingEnabled: boolean; // réglage opt-in, voir ProfileScreen.tsx
  arretAutoVitesse: boolean; // réglage opt-out, voir SettingsScreen.tsx
  traceColor: string; // accent choisi par le joueur, voir logic/prefs.ts
  avatarId: string | null; // voir logic/avatars.ts
  stepGoal: number; // objectif quotidien de pas, voir logic/prefs.ts
  fusionResume: FusionResume | null;
}

function freshState(): WalkediaState {
  return {
    graph: null,
    proj: null,
    center: null,
    centers: [],
    neighborhoods: new Map(),
    junctionNeighborhood: new Map(),
    discovered: discovered.fresh(),
    expanding: false,
    lastExpandTry: 0,
    gridLoading: false,
    lastGridLoadTry: 0,
    progress: { edges: new Set(), junctions: new Set(), completedAt: {}, edgeMeters: 0, edgeVisits: {}, sessions: [] },
    matcher: null,
    session: null,
    position: null,
    lastFix: null,
    speedStreak: 0,
    idleMovement: null,
    toast: null,
    pointsGagnes: [],
    sortieResume: null,
    marcheDetectee: null,
    ready: false,
    mapReady: false,
    startStatus: '',
    startStatusKind: 'loading',
    userId: null,
    syncing: false,
    loadLog: [],
    backgroundTrackingEnabled: false,
    arretAutoVitesse: true,
    traceColor: '#6C5DF4',
    avatarId: null,
    stepGoal: 7000,
    fusionResume: null,
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
//
// Doit rester rigoureusement identique à snapToGrid dans get-region/index.ts :
// c'est ce calcul qui produit la clé de cache côté serveur.
function snapToGrid(lat: number, lon: number, cellMeters: number): [number, number] {
  const ky = 110540;
  const gy = (Math.round((lat * ky) / cellMeters) * cellMeters) / ky;
  // `kx` dérive de la latitude ARRONDIE, jamais de celle reçue : sinon deux
  // points de la même case, à des latitudes un peu différentes, reconstruisent
  // une longitude légèrement différente et ne partagent plus ni le même centre
  // ici, ni la même entrée de cache côté serveur.
  const kx = 111320 * Math.cos((gy * Math.PI) / 180);
  const gx = (Math.round((lon * kx) / cellMeters) * cellMeters) / kx;
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
// (assigné côté serveur, voir applyRegion). Les carrefours sans quartier
// (fréquent : la plupart des villes n'ont pas de contour de quartier dans
// OSM, voir supabase/functions/_shared/neighborhoods.ts) ne contribuent à
// aucune ligne.
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
  // Nommé `translate` plutôt que le `t` habituel de react-i18next : onFix
  // plus bas prend un paramètre `t` (timestamp, comme tout le reste du
  // fichier) qui masquerait sinon la fonction de traduction dans sa portée.
  const { t: translate } = useTranslation();
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
    // Géométrie déjà découverte : chargée en parallèle de la progression, et
    // indépendamment d'elle. C'est ce qui permet à la carte d'afficher
    // l'historique du joueur avant même que la première zone soit revenue du
    // serveur.
    discovered.load().then((d: Discovered) => {
      state.discovered = d;
      rerender();
    });
    // Reflète l'état réel de la tâche de fond (peut avoir été activée lors
    // d'une session précédente) plutôt que de supposer `false` par défaut.
    isBackgroundTrackingActive().then((active) => {
      state.backgroundTrackingEnabled = active;
      rerender();
    });
    loadPrefs().then((p) => {
      state.arretAutoVitesse = p.arretAutoVitesse;
      state.traceColor = p.traceColor;
      state.avatarId = p.avatarId;
      state.stepGoal = p.stepGoal;
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
        const localBefore = state.progress.edges.size;
        const { data, error } = await supabase.from('progress').select('*').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (data) {
          const remoteEdges: string[] = data.edges || [];
          for (const id of remoteEdges) state.progress.edges.add(id);
          for (const id of data.junctions || []) state.progress.junctions.add(id);
          for (const [jid, at] of Object.entries<number>(data.completed_at || {})) {
            const local = state.progress.completedAt[jid];
            state.progress.completedAt[jid] = local ? Math.min(local, at) : at;
          }
          state.progress.edgeMeters = Math.max(state.progress.edgeMeters, data.edge_meters || 0);
          for (const [eid, count] of Object.entries<number>(data.edge_visits || {})) {
            state.progress.edgeVisits[eid] = Math.max(state.progress.edgeVisits[eid] || 0, count);
          }
          // `syncOnSignIn` s'exécute à chaque démarrage tant qu'une session
          // persiste (voir App.tsx, la ref démarre à null à chaque lancement
          // JS), pas seulement à la toute première connexion. Une fois les
          // deux côtés fusionnés une fois, les lancements suivants retombent
          // sur le même total (`total === localBefore`) : rien de nouveau,
          // donc pas de fusion à montrer — c'est exactement le cas qui
          // produisait un écran "31 + 31 = 31" à chaque ouverture.
          const total = state.progress.edges.size;
          if (localBefore > 0 && total > localBefore) {
            state.fusionResume = { local: localBefore, compte: remoteEdges.length, total, communes: localBefore + remoteEdges.length - total };
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

        // Avatar : le compte fait foi une fois connecté (c'est justement le
        // moment où on rapatrie son état). Si le compte n'en a pas encore
        // mais que l'appareil en a déjà choisi un, on le pousse plutôt que de
        // l'effacer — sinon choisir un avatar avant la toute première
        // connexion serait perdu au premier sync.
        const { data: profil } = await supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
        if (profil?.avatar_url) {
          state.avatarId = profil.avatar_url;
          savePrefs({ avatarId: profil.avatar_url });
        } else if (state.avatarId) {
          supabase.from('profiles').update({ avatar_url: state.avatarId }).eq('id', userId).then(() => {});
        }

        await storage.save(state.progress);
        await pushProgress();
        toast(translate('toast.syncSuccess'));
      } catch (err: any) {
        toast(translate('toast.syncFailed', { message: err.message }));
      } finally {
        state.syncing = false;
        rerender();
      }
    },
    [state, pushProgress, rerender, toast, translate]
  );

  const signOutLocally = useCallback(() => {
    state.userId = null;
    rerender();
  }, [state, rerender]);

  // -------------------------------------------------------- zones & graphe

  // Intègre une zone reçue de l'Edge Function. Plus aucune construction de
  // graphe ici : le serveur l'a déjà fait, avec une marge qui garantit que
  // deux zones voisines décrivent le recouvrement à l'identique (voir
  // logic/regionGraph.ts) — il n'y a donc plus rien à recalculer, ni à
  // reconstruire depuis zéro à chaque nouvelle zone comme avant.
  // L'assignation carrefour -> quartier vient elle aussi du serveur — mais
  // elle peut arriver vide sur une zone jamais visitée : le serveur répond
  // sans attendre les quartiers (une requête Overpass à part, qui pesait
  // jusqu'à 60 s) et complète sa ligne de cache ensuite. Les statistiques par
  // quartier du profil apparaissent alors au prochain chargement de la zone.
  // Mémorise la géométrie d'un tronçon/carrefour au moment où il est acquis,
  // pour pouvoir le redessiner plus tard sans sa zone (voir
  // logic/discovered.ts). L'écriture sur disque est différée et regroupée :
  // ces appels arrivent en pleine boucle GPS.
  const rememberEdge = useCallback(
    (edgeId: string) => {
      const e = state.graph?.edges.get(edgeId);
      if (!e) return;
      state.discovered.edges.set(edgeId, { coords: e.coords, length: e.length, at: Date.now() });
      discovered.scheduleSave(state.discovered);
    },
    [state]
  );

  const rememberJunction = useCallback(
    (j: { id: string; lat: number; lon: number }) => {
      state.discovered.junctions.set(j.id, [j.lat, j.lon]);
      discovered.scheduleSave(state.discovered);
    },
    [state]
  );

  const applyRegion = useCallback(
    (region: Region) => {
      if (!state.graph) state.graph = emptyGraph();
      mergeGraph(state.graph, region.graph);
      for (const n of region.neighborhoods) state.neighborhoods.set(n.id, n);
      for (const [jid, nid] of region.junctionNeighborhood) state.junctionNeighborhood.set(jid, nid);
      // Le centre retenu est celui que le SERVEUR a arrondi, pas le point
      // demandé : c'est lui qui décrit le cercle réellement servi, donc celui
      // sur lequel doivent porter « zone déjà couverte » et le garde-fou de
      // bord (voir distToNearestCenter/nearBoundary).
      if (!state.centers.some((c) => c[0] === region.center[0] && c[1] === region.center[1])) {
        state.centers.push(region.center);
      }

      // Rattrapage : la zone qui arrive contient peut-être la géométrie de
      // tronçons/carrefours déjà acquis mais qu'on ne savait pas dessiner —
      // progression revenue d'un autre appareil, ou acquise avant l'ajout de
      // ce magasin. On en profite pour la mémoriser.
      let rattrapes = 0;
      for (const id of state.progress.edges) {
        if (state.discovered.edges.has(id)) continue;
        const e = region.graph.edges.get(id);
        if (!e) continue;
        state.discovered.edges.set(id, { coords: e.coords, length: e.length, at: Date.now() });
        rattrapes++;
      }
      for (const id of state.progress.junctions) {
        if (state.discovered.junctions.has(id)) continue;
        const j = region.graph.junctions.get(id);
        if (!j) continue;
        state.discovered.junctions.set(id, [j.lat, j.lon]);
        rattrapes++;
      }
      if (rattrapes > 0) discovered.scheduleSave(state.discovered);

      // Nouvelle référence d'objet, mêmes Map à l'intérieur : le graphe est
      // fusionné EN PLACE, or le rendu de la carte le mémoïse sur cette
      // référence (useMemo dans MapScreen). Sans ça, une zone chargée par le
      // GPS à l'arrêt n'apparaîtrait qu'au prochain déplacement de la carte.
      state.graph = { ...state.graph };
    },
    [state]
  );

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
      rememberJunction(j);
      return true;
    },
    [state, rememberJunction]
  );

  const sweepCompletions = useCallback(
    (announce: boolean) => {
      if (!state.graph) return 0;
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
        if (announce && gained > 0) toast(translate('toast.junctionsCompleted', { count: gained }));
      }
      return gained;
    },
    [state, checkJunction, persist, toast, translate]
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
        if (opts.announceSkip) toast(translate('toast.tooZoomedOut'));
        return;
      }
      const [lat, lon] = snapToGrid(rawLat, rawLon, RADIUS);
      const now = Date.now();
      if (state.expanding) {
        logLoad({ trigger, outcome: 'skip-in-progress' });
        if (opts.announceSkip) toast(translate('toast.loadingInProgress'));
        return;
      }
      const wait = EXPAND_COOLDOWN - (now - state.lastExpandTry);
      if (wait > 0) {
        logLoad({ trigger, outcome: 'skip-cooldown', detail: `encore ${Math.ceil(wait / 1000)}s` });
        if (opts.announceSkip) toast(translate('toast.retryIn', { seconds: Math.ceil(wait / 1000) }));
        return;
      }
      const dist = distToNearestCenter(state, lat, lon);
      if (dist <= RADIUS - EXPAND_MARGIN) {
        logLoad({ trigger, outcome: 'skip-covered', detail: `${Math.round(dist)} m du centre le plus proche` });
        if (opts.announceSkip) toast(translate('toast.alreadyCovered'));
        return;
      }
      state.expanding = true;
      state.lastExpandTry = now;
      const startedAt = Date.now();
      try {
        applyRegion(await fetchRegion(lat, lon));
        if (state.matcher) state.matcher = new Matcher(state.graph, state.proj, state.matcher);
        sweepCompletions(false);
        rerender();
        toast(translate('toast.newZoneLoaded'));
        logLoad({
          trigger,
          outcome: 'success',
          durationMs: Date.now() - startedAt,
          edges: state.graph!.edges.size,
          junctions: state.graph!.junctions.size,
        });
      } catch (err: any) {
        toast(translate('toast.zoneExpandFailed', { message: err.message }));
        logLoad({ trigger, outcome: 'error', detail: err.message, durationMs: Date.now() - startedAt });
      } finally {
        state.expanding = false;
      }
    },
    [state, applyRegion, sweepCompletions, rerender, toast, logLoad, translate]
  );

  // Remplissage en grille de la zone visible en mode cluster (voir
  // MAX_GRID_LOAD_LATITUDE_DELTA ci-dessus) : calcule les centres de zone
  // (même grille que snapToGrid) manquants dans le viewport, en charge un
  // lot plafonné séquentiellement (jamais en parallèle : autant de calculs
  // complets déclenchés d'un coup côté serveur sur des zones inconnues
  // seraient autant de rafales vers les miroirs Overpass), triés du plus
  // proche du centre visible au plus loin. Un déclenchement qui dépasse le
  // plafond laisse le reste pour un prochain déclenchement (pan/zoom suivant).
  const loadVisibleGrid = useCallback(
    async (lat: number, lon: number, latitudeDelta: number, longitudeDelta: number) => {
      if (latitudeDelta > MAX_GRID_LOAD_LATITUDE_DELTA) {
        logLoad({ trigger: 'batch', outcome: 'skip-too-zoomed-out', detail: `${(latitudeDelta * 110.54).toFixed(1)} km de hauteur visible` });
        return;
      }
      if (state.gridLoading) {
        logLoad({ trigger: 'batch', outcome: 'skip-in-progress' });
        return;
      }
      const now = Date.now();
      const wait = GRID_LOAD_COOLDOWN - (now - state.lastGridLoadTry);
      if (wait > 0) {
        logLoad({ trigger: 'batch', outcome: 'skip-cooldown', detail: `encore ${Math.ceil(wait / 1000)}s` });
        return;
      }

      const kx = 111320 * Math.cos((lat * Math.PI) / 180);
      const ky = 110540;
      const halfWm = (longitudeDelta * kx) / 2;
      const halfHm = (latitudeDelta * ky) / 2;
      const centerX = lon * kx;
      const centerY = lat * ky;
      const candidates: [number, number][] = [];
      for (let x = centerX - halfWm; x <= centerX + halfWm; x += RADIUS) {
        for (let y = centerY - halfHm; y <= centerY + halfHm; y += RADIUS) {
          candidates.push([y / ky, x / kx]);
        }
      }
      const missing = candidates.filter(([clat, clon]) => distToNearestCenter(state, clat, clon) > RADIUS - EXPAND_MARGIN);
      if (!missing.length) {
        logLoad({ trigger: 'batch', outcome: 'skip-covered', detail: 'zone visible déjà couverte' });
        return;
      }
      missing.sort((a, b) => haversine([lat, lon], a) - haversine([lat, lon], b));
      const batch = missing.slice(0, GRID_BATCH_MAX_ZONES);

      state.gridLoading = true;
      state.lastGridLoadTry = now;
      const startedAt = Date.now();
      let loaded = 0;
      let failed = 0;
      for (const [clat, clon] of batch) {
        // Un centre proche peut avoir déjà été couvert par un fetch
        // précédent DE CE MÊME lot (zones voisines qui se chevauchent).
        if (distToNearestCenter(state, clat, clon) <= RADIUS - EXPAND_MARGIN) continue;
        try {
          applyRegion(await fetchRegion(clat, clon));
          loaded++;
        } catch {
          failed++;
        }
      }

      if (loaded > 0) {
        if (state.matcher) state.matcher = new Matcher(state.graph, state.proj, state.matcher);
        sweepCompletions(false);
        rerender();
        toast(translate('toast.extraZonesLoaded', { count: loaded }));
      }
      logLoad({
        trigger: 'batch',
        outcome: loaded > 0 ? 'success' : 'error',
        detail: `${loaded} chargée(s), ${failed} échouée(s), ${Math.max(0, missing.length - batch.length)} en attente`,
        durationMs: Date.now() - startedAt,
        edges: state.graph?.edges.size,
        junctions: state.graph?.junctions.size,
      });
      state.gridLoading = false;
    },
    [state, applyRegion, sweepCompletions, rerender, toast, logLoad, translate]
  );

  // ------------------------------------------------------------- suivi GPS

  const onFixRef = useRef<((lat: number, lon: number, accuracy: number | null, t: number, speed: number | null) => void) | undefined>(
    undefined
  );
  // Référence indirecte pour casser le cycle de dépendance avec onFix (défini
  // avant startSession, voir plus bas — même pattern que endSessionRef).
  const startSessionRef = useRef<(() => void) | undefined>(undefined);

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

  // Rejoue une liste de fixes (marche non trackée) à travers un matcher
  // temporaire, comme une session normale mais rétroactive. Utilisé par la
  // détection en arrière-plan (voir backgroundLocation.ts) : la source des
  // fixes (tampon AsyncStorage rempli par la tâche de fond) est découplée de
  // cette logique de rejeu, qui ne dépend que de la liste passée en
  // paramètre.
  const importShadowWalk = useCallback(
    async (fixes: Fix[], startedAt: number) => {
      const graph = state.graph;
      if (!graph) return; // appelé une fois la zone initiale chargée (voir init)
      const matcher = new Matcher(graph, state.proj);
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
            state.progress.edgeMeters += graph.edges.get(edgeId)!.length;
            rememberEdge(edgeId);
            newEdges.add(edgeId);
            for (const jid of graph.edgeJunctions.get(edgeId) || []) {
              const j = graph.junctions.get(jid);
              if (j && checkJunction(j)) newInter.add(jid);
            }
          }
        }
        if (cur.accuracy == null || cur.accuracy <= MAX_ACCURACY) prevFix = cur;
      }

      state.progress.sessions.push({
        start: startedAt,
        end: fixes[fixes.length - 1].t as number,
        edges: newEdges.size,
        junctions: newInter.size,
        imported: true,
        km: lineLength(fixes.map((f) => [f.lat, f.lon])) / 1000,
      });
      await persist();
      rerender();
      toast(translate('toast.walkImported', { edges: newEdges.size, junctions: newInter.size }), 6000);
    },
    [state, checkJunction, persist, rememberEdge, rerender, toast, translate]
  );

  // Règle 1 (app fermée) : vérifie au démarrage si la tâche de fond a
  // détecté une marche assez significative pendant que l'app n'était pas
  // ouverte, et propose de l'importer. Appelé une fois le graphe prêt (voir
  // init) puisque le rejeu a besoin de `state.graph`/`state.proj`.
  const checkBackgroundImport = useCallback(async () => {
    const found = await consumeBackgroundBuffer();
    if (!found) return;
    const mins = Math.max(1, Math.round((found.fixes[found.fixes.length - 1].t - found.startedAt) / 60000));
    state.marcheDetectee = { distanceM: found.distance, minutes: mins, fixes: found.fixes, startedAt: found.startedAt };
    rerender();
  }, [state, rerender]);

  const importerMarcheDetectee = useCallback(() => {
    const m = state.marcheDetectee;
    if (!m) return;
    state.marcheDetectee = null;
    importShadowWalk(m.fixes, m.startedAt);
  }, [state, importShadowWalk]);

  const ignorerMarcheDetectee = useCallback(() => {
    state.marcheDetectee = null;
    rerender();
  }, [state, rerender]);

  const enableBackgroundTracking = useCallback(async () => {
    const result = await startBackgroundTracking();
    if (result.ok) {
      state.backgroundTrackingEnabled = true;
      toast(translate('toast.backgroundTrackingEnabled'));
    } else {
      toast(result.reason);
    }
    rerender();
  }, [state, rerender, toast, translate]);

  const disableBackgroundTracking = useCallback(async () => {
    await stopBackgroundTracking();
    state.backgroundTrackingEnabled = false;
    rerender();
  }, [state, rerender]);

  const onFix = useCallback(
    (lat: number, lon: number, accuracy: number | null, t: number, speed: number | null) => {
      // position affichée
      state.position = { lat, lon, accuracy };
      maybeExpand(lat, lon, { trigger: 'gps' });

      // Auto-démarrage de session (règle 2) : accumule une courte distance
      // roulante tant qu'aucune session n'est active ; dès qu'un mouvement
      // plausible pour de la marche dépasse AUTO_START_DISTANCE, démarre une
      // session directement (remplace l'ancien "shadow walk" qui demandait
      // confirmation après coup). Le garde-fou de vitesse (plus bas, une fois
      // une session active) reste la protection contre les faux positifs
      // (voiture, vélo) une fois démarrée.
      if (!state.session) {
        if (accuracy != null && accuracy > MAX_ACCURACY) {
          rerender();
          return;
        }
        const prev = state.idleMovement;
        if (!prev || t - prev.t > AUTO_START_MAX_GAP) {
          state.idleMovement = { lat, lon, t, distance: 0 };
        } else {
          const stepDist = haversine([prev.lat, prev.lon], [lat, lon]);
          const dtSec = (t - prev.t) / 1000;
          const speedKmh = dtSec > 0 ? (stepDist / dtSec) * 3.6 : 0;
          if (dtSec >= 1 && speedKmh <= SPEED_LIMIT_KMH) {
            const distance = prev.distance + stepDist;
            state.idleMovement = { lat, lon, t, distance };
            if (distance >= AUTO_START_DISTANCE) {
              state.idleMovement = null;
              // eslint-disable-next-line @typescript-eslint/no-use-before-define
              startSessionRef.current?.();
              // startSession refuse tant que la zone n'est pas chargée : ne pas
              // annoncer un démarrage qui n'a pas eu lieu (il en émet alors son
              // propre message).
              if (state.session) toast(translate('toast.autoSessionStarted'));
            }
          } else {
            // Vitesse implausible pour de la marche (saut GPS, véhicule) :
            // ne compte pas ce pas, repart de ce point sans perdre la
            // distance déjà accumulée.
            state.idleMovement = { lat, lon, t, distance: prev.distance };
          }
        }
        rerender();
        return;
      }
      state.session.track.push([lat, lon]);

      const cur: Fix = { lat, lon, accuracy, t };
      const prev = accuracy != null && accuracy > MAX_ACCURACY ? null : state.lastFix;

      const speedKmh = estimateSpeedKmh(prev, cur, speed);
      if (state.arretAutoVitesse && speedKmh != null && speedKmh > SPEED_LIMIT_KMH) {
        state.speedStreak++;
        if (state.speedStreak >= SPEED_STREAK_LIMIT) {
          state.speedStreak = 0;
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          endSessionRef.current?.(Math.round(speedKmh));
          return;
        }
      } else {
        state.speedStreak = 0;
      }

      const fixes = interpolatedFixes(prev, cur);
      if (accuracy == null || accuracy <= MAX_ACCURACY) state.lastFix = cur;

      let anyChange = false;
      const graph = state.graph!; // une session ne démarre qu'avec un graphe chargé
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
          state.progress.edgeMeters += graph.edges.get(edgeId)!.length;
          rememberEdge(edgeId);
          state.session.newEdges.add(edgeId);
          anyChange = true;
          for (const jid of graph.edgeJunctions.get(edgeId) || []) {
            const j = graph.junctions.get(jid);
            if (j && checkJunction(j)) {
              state.session.newInter.add(jid);
              let nouvelles = 0;
              for (const id of j.requiredEdgeIds) if (state.session.newEdges.has(id)) nouvelles++;
              state.pointsGagnes.push({
                junctionId: jid,
                numero: state.progress.junctions.size,
                nouvelles,
                total: j.requiredEdgeIds.size,
              });
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
    [state, maybeExpand, rerender, checkJunction, persist, rememberEdge, toast, translate]
  );
  onFixRef.current = onFix;

  // ---------------------------------------------------------------- session

  const startSession = useCallback(() => {
    // La carte s'ouvre désormais avant que la zone soit chargée (voir init) :
    // sans réseau, le map matching n'a rien sur quoi projeter, et une session
    // démarrée là ne créditerait aucun tronçon. Vaut aussi pour le démarrage
    // automatique déclenché par onFix.
    if (!state.graph) {
      toast(translate('toast.zoneNotLoadedYet'));
      return;
    }
    state.matcher = new Matcher(state.graph, state.proj);
    state.lastFix = null;
    state.speedStreak = 0;
    state.idleMovement = null; // pas de sens hors session, évite un résidu périmé au prochain arrêt
    state.session = { newEdges: new Set(), newInter: new Set(), track: [], startedAt: Date.now() };
    rerender();
    toast(translate('toast.sessionStarted'));
  }, [state, rerender, toast, translate]);
  startSessionRef.current = startSession;

  // `vitesseKmh` : présent seulement quand l'arrêt est automatique (le joueur
  // roulait), voir onFix. Porté jusqu'au résumé plutôt que traité ici, pour
  // que SessionSummary puisse dire « tu roulais à 24 km/h » au lieu d'un
  // arrêt qui semble arbitraire.
  const endSession = useCallback(
    (vitesseKmh?: number) => {
      if (!state.session) return;
      const { newEdges, newInter, track, startedAt } = state.session;
      state.session = null;
      state.matcher = null;
      state.lastFix = null;
      state.idleMovement = null;

      const km = lineLength(track) / 1000;
      state.progress.sessions.push({ start: startedAt, end: Date.now(), edges: newEdges.size, junctions: newInter.size, km });
      persist();
      // Fin de session : on n'attend pas le prochain cycle différé pour écrire
      // la géométrie découverte — c'est typiquement le moment où l'app va être
      // mise en arrière-plan ou fermée.
      discovered.flush(state.discovered).catch(() => {});

      state.sortieResume = {
        edges: newEdges.size,
        junctions: newInter.size,
        km,
        minutes: Math.round((Date.now() - startedAt) / 60000),
        raisonVitesse: vitesseKmh ?? null,
      };
      rerender();
    },
    [state, persist, rerender]
  );

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

      // La carte s'ouvre dès que la position est connue, SANS attendre la
      // zone : l'historique déjà découvert (logic/discovered.ts) est
      // dessinable immédiatement, et le premier chargement de zone peut
      // prendre des dizaines de secondes quand les miroirs Overpass rament.
      // Le réseau non encore découvert apparaît quand la zone arrive.
      state.center = [lat, lon];
      state.proj = makeProj(lat);
      state.mapReady = true;
      state.startStatus = translate('start.loadingNetwork');
      state.startStatusKind = 'loading';
      // `expanding` pendant tout le chargement initial : c'est le même verrou
      // que maybeExpand, donc un tick GPS survenant entre-temps ne relancera
      // pas une requête pour la même zone.
      state.expanding = true;
      rerender();

      await startWatch();

      const startedAt = Date.now();
      let region: Region;
      try {
        region = await fetchRegion(lat, lon);
      } catch (err: any) {
        state.expanding = false;
        state.startStatus = translate('start.zoneLoadFailed', { message: err.message });
        state.startStatusKind = 'error';
        rerender();
        toast(translate('toast.zoneUnavailable', { message: err.message }), 6000);
        logLoad({ trigger: 'init', outcome: 'error', detail: err.message, durationMs: Date.now() - startedAt });
        return;
      }

      applyRegion(region);
      state.expanding = false;
      sweepCompletions(false);
      rerender();
      toast(translate('toast.segmentsInZone', { edges: state.graph!.edges.size, junctions: state.graph!.junctions.size }));
      logLoad({
        trigger: 'init',
        outcome: 'success',
        durationMs: Date.now() - startedAt,
        edges: state.graph!.edges.size,
        junctions: state.graph!.junctions.size,
      });

      checkBackgroundImport();
    },
    [state, applyRegion, sweepCompletions, rerender, toast, startWatch, logLoad, checkBackgroundImport, translate]
  );

  const requestLocationAndInit = useCallback(async () => {
    // Garde-fou : le bouton de l'écran de démarrage reste actif pendant le
    // déclenchement automatique à l'ouverture, un double appel (tap pendant
    // que la géoloc tourne déjà) ne doit pas relancer toute la séquence.
    if (requestingLocation.current || state.mapReady) return;
    requestingLocation.current = true;
    state.startStatus = translate('start.searchingPosition');
    state.startStatusKind = 'loading';
    rerender();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        state.startStatus = translate('start.permissionDenied');
        state.startStatusKind = 'permissionDenied';
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
        err && err.message === 'timeout' ? translate('start.timeout') : translate('start.positionUnavailable');
      state.startStatusKind = 'error';
      rerender();
    } finally {
      requestingLocation.current = false;
    }
  }, [state, rerender, init, translate]);

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
      toast(translate('toast.notEnoughNetwork'));
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
  }, [state, buildSimPath, toast, translate]);

  const recenter = useCallback(() => {
    if (state.position) return [state.position.lat, state.position.lon] as [number, number];
    return state.center;
  }, [state]);

  // Consomme le point gagné affiché en tête de file (voir PointGagne) : au
  // pluriel dans state pour ne pas en perdre si le matching en crédite
  // plusieurs d'un coup, mais montré un par un.
  const dismissPointGagne = useCallback(() => {
    state.pointsGagnes.shift();
    rerender();
  }, [state, rerender]);

  const dismissSortieResume = useCallback(() => {
    state.sortieResume = null;
    rerender();
  }, [state, rerender]);

  const dismissFusionResume = useCallback(() => {
    state.fusionResume = null;
    rerender();
  }, [state, rerender]);

  const setArretAutoVitesse = useCallback(
    (next: boolean) => {
      state.arretAutoVitesse = next;
      savePrefs({ arretAutoVitesse: next });
      rerender();
    },
    [state, rerender]
  );

  const setTraceColor = useCallback(
    (hex: string) => {
      state.traceColor = hex;
      savePrefs({ traceColor: hex });
      rerender();
    },
    [state, rerender]
  );

  // Persiste sur l'appareil comme les autres préférences, et pousse vers
  // `profiles.avatar_url` s'il y a un compte — la seule colonne de la table
  // qui s'y prête (voir supabase/migrations/0001_init.sql) : ce n'est pas une
  // URL au sens strict, juste l'id local (voir logic/avatars.ts), les
  // avatars étant embarqués dans l'app plutôt qu'hébergés. Fire-and-forget
  // comme pushProgress : un échec ne doit pas bloquer le choix local.
  const setAvatar = useCallback(
    (id: string | null) => {
      state.avatarId = id;
      savePrefs({ avatarId: id });
      rerender();
      if (state.userId) {
        supabase.from('profiles').update({ avatar_url: id }).eq('id', state.userId).then(() => {});
      }
    },
    [state, rerender]
  );

  const setStepGoal = useCallback(
    (steps: number) => {
      state.stepGoal = steps;
      savePrefs({ stepGoal: steps });
      rerender();
    },
    [state, rerender]
  );

  // Efface la progression — rues, points, sessions — sur l'appareil et sur le
  // compte s'il y en a un. Sans retour possible (voir SettingsScreen.tsx, qui
  // porte la confirmation) : ne touche ni les préférences ni la session
  // Supabase elle-même, seulement le relevé.
  const wipeProgress = useCallback(async () => {
    state.progress = { edges: new Set(), junctions: new Set(), completedAt: {}, edgeMeters: 0, edgeVisits: {}, sessions: [] };
    state.discovered = discovered.fresh();
    await storage.save(state.progress);
    await discovered.save(state.discovered);
    if (state.userId) {
      await supabase.from('progress').delete().eq('user_id', state.userId);
      await supabase.from('sessions').delete().eq('user_id', state.userId);
    }
    rerender();
  }, [state, rerender]);

  return {
    state,
    actions: {
      requestLocationAndInit,
      startSession,
      endSession,
      dismissPointGagne,
      dismissSortieResume,
      dismissFusionResume,
      importerMarcheDetectee,
      ignorerMarcheDetectee,
      simulateWalk,
      recenter,
      maybeExpand,
      loadVisibleGrid,
      syncOnSignIn,
      signOutLocally,
      enableBackgroundTracking,
      disableBackgroundTracking,
      setArretAutoVitesse,
      setTraceColor,
      setAvatar,
      setStepGoal,
      wipeProgress,
    },
  };
}
