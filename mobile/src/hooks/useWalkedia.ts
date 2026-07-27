// Portage de la logique de js/main.js (état + règles métier), sans DOM/Leaflet :
// le rendu (carte, HUD, onglets) est fait de façon déclarative par les écrans
// React à partir de `state`, retourné par ce hook. Les fonctions ci-dessous
// mutent `state` (comme l'original) puis déclenchent un re-render via un
// compteur de révision — ça évite de retraduire toute la logique en state
// immuable et limite le risque de régression sur une logique dense.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';

import { fetchNetwork } from '../logic/overpass';
import { buildGraph } from '../logic/graph';
import { Matcher, MAX_ACCURACY } from '../logic/matching';
import { makeProj, haversine } from '../logic/geo';
import * as storage from '../logic/storage';
import type { Progress } from '../logic/storage';

const INTERP_STEP = 5; // m : ré-échantillonnage entre deux fix GPS successifs
const MAX_INTERP_GAP = 150; // m : au-delà, on suppose un saut GPS
const MAX_INTERP_TIME = 20000; // ms : au-delà, le fix précédent est trop vieux

const SPEED_LIMIT_KMH = 20;
const SPEED_STREAK_LIMIT = 2;

const SHADOW_MAX_AGE = 3600000;
const SHADOW_MAX_POINTS = 4000;
const SHADOW_MIN_DISTANCE = 80;

const RADIUS = 800;
const BOUNDARY_MARGIN = 100;
const EXPAND_MARGIN = 300;
const EXPAND_COOLDOWN = 30000;

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

interface WalkediaState {
  graph: any;
  proj: ((lat: number, lon: number) => number[]) | null;
  center: [number, number] | null;
  centers: [number, number][];
  osmRaw: { nodes: Map<number, [number, number]>; ways: Map<number, any> };
  expanding: boolean;
  lastExpandTry: number;
  progress: Progress;
  matcher: any;
  session: SessionState | null;
  position: { lat: number; lon: number; accuracy: number | null } | null;
  lastFix: Fix | null;
  speedStreak: number;
  shadow: { fixes: Fix[]; startedAt: number | null };
  toast: { msg: string; key: number } | null;
  ready: boolean; // progrès chargé depuis AsyncStorage
  mapReady: boolean; // graphe initial chargé
  startStatus: string;
}

function freshState(): WalkediaState {
  return {
    graph: null,
    proj: null,
    center: null,
    centers: [],
    osmRaw: { nodes: new Map(), ways: new Map() },
    expanding: false,
    lastExpandTry: 0,
    progress: { edges: new Set(), junctions: new Set(), completedAt: {}, edgeMeters: 0, sessions: [] },
    matcher: null,
    session: null,
    position: null,
    lastFix: null,
    speedStreak: 0,
    shadow: { fixes: [], startedAt: null },
    toast: null,
    ready: false,
    mapReady: false,
    startStatus: '',
  };
}

// -------------------------------------------------------------- géométrie carrefour

function distToNearestCenter(state: WalkediaState, lat: number, lon: number) {
  let best = Infinity;
  for (const c of state.centers) best = Math.min(best, haversine([lat, lon], c));
  return best;
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

// ---------------------------------------------------------------------- hook

export function useWalkedia() {
  const stateRef = useRef<WalkediaState>(freshState());
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  const watchSub = useRef<Location.LocationSubscription | null>(null);

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

  const persist = useCallback(() => storage.save(state.progress), [state]);

  // -------------------------------------------------------- zones & graphe

  const mergeOsm = useCallback(
    (osm: { nodes: Map<number, [number, number]>; ways: any[] }) => {
      for (const [id, c] of osm.nodes) state.osmRaw.nodes.set(id, c);
      for (const w of osm.ways) state.osmRaw.ways.set(w.id, w);
    },
    [state]
  );

  const rebuildGraph = useCallback(() => {
    state.graph = buildGraph({ nodes: state.osmRaw.nodes, ways: [...state.osmRaw.ways.values()] });
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

  const maybeExpand = useCallback(
    async (lat: number, lon: number) => {
      const now = Date.now();
      if (state.expanding || now - state.lastExpandTry < EXPAND_COOLDOWN) return;
      if (distToNearestCenter(state, lat, lon) <= RADIUS - EXPAND_MARGIN) return;
      state.expanding = true;
      state.lastExpandTry = now;
      try {
        const osm = await fetchNetwork(lat, lon, RADIUS);
        mergeOsm(osm);
        state.centers.push([lat, lon]);
        rebuildGraph();
        if (state.matcher) state.matcher = new Matcher(state.graph, state.proj, state.matcher);
        sweepCompletions(false);
        rerender();
        toast('Nouvelle zone chargée 🗺️');
      } catch (err: any) {
        toast('Extension de zone impossible : ' + err.message);
      } finally {
        state.expanding = false;
      }
    },
    [state, mergeOsm, rebuildGraph, sweepCompletions, rerender, toast]
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

  // Propose l'import si une marche significative a été suivie hors session ;
  // résout une fois la décision de l'utilisateur prise (ou immédiatement s'il
  // n'y a rien à proposer).
  const maybeImportShadowWalk = useCallback((): Promise<void> => {
    const { fixes, startedAt } = state.shadow;
    if (fixes.length < 2 || startedAt == null) return Promise.resolve();
    const dist = shadowDistance(fixes);
    if (dist < SHADOW_MIN_DISTANCE) {
      clearShadow();
      return Promise.resolve();
    }
    const mins = Math.max(1, Math.round(((fixes[fixes.length - 1].t as number) - startedAt) / 60000));
    return new Promise((resolve) => {
      Alert.alert(
        'Marche détectée',
        `Marche détectée avant le démarrage de la session (~${mins} min, ${Math.round(dist)} m).\nImporter ce trajet dans ton historique ?`,
        [
          { text: 'Annuler', style: 'cancel', onPress: () => { clearShadow(); resolve(); } },
          { text: 'Importer', onPress: () => { importShadowWalk().then(resolve); } },
        ]
      );
    });
  }, [state, clearShadow, importShadowWalk]);

  const onFix = useCallback(
    (lat: number, lon: number, accuracy: number | null, t: number, speed: number | null) => {
      // position affichée
      state.position = { lat, lon, accuracy };
      maybeExpand(lat, lon);

      if (!state.session) {
        bufferShadowFix(lat, lon, accuracy, t);
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
    [state, maybeExpand, bufferShadowFix, rerender, checkJunction, persist, toast]
  );
  onFixRef.current = onFix;

  // ---------------------------------------------------------------- session

  const startSession = useCallback(async () => {
    await maybeImportShadowWalk();
    state.matcher = new Matcher(state.graph, state.proj);
    state.lastFix = null;
    state.speedStreak = 0;
    state.session = { newEdges: new Set(), newInter: new Set(), track: [], startedAt: Date.now() };
    rerender();
    toast('Session démarrée — bonne exploration !');
  }, [state, maybeImportShadowWalk, rerender, toast]);

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
      let osm;
      try {
        osm = await fetchNetwork(lat, lon, RADIUS);
      } catch (err: any) {
        state.startStatus = 'Impossible de charger les données OSM : ' + err.message;
        rerender();
        return;
      }

      state.center = [lat, lon];
      state.proj = makeProj(lat);
      mergeOsm(osm);
      state.centers.push([lat, lon]);
      rebuildGraph();
      sweepCompletions(false);
      state.mapReady = true;
      rerender();
      toast(`${state.graph.edges.size} tronçons · ${state.graph.junctions.size} carrefours dans la zone`);

      await startWatch();
    },
    [state, mergeOsm, rebuildGraph, sweepCompletions, rerender, toast, startWatch]
  );

  const requestLocationAndInit = useCallback(async () => {
    state.startStatus = 'Recherche de ta position…';
    rerender();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      state.startStatus =
        "Accès à la position refusé. Autorise la position pour Walkedia dans les réglages du téléphone, puis relance l'app.";
      rerender();
      return;
    }
    try {
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
    actions: { requestLocationAndInit, startSession, endSession, simulateWalk, recenter },
  };
}
