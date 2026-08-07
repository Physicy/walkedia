import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Circle, Marker, Polyline, Region, UrlTile } from 'react-native-maps';

import { edgeIsFound, junctionIsDone } from '../hooks/useWalkedia';
import { Hud } from '../components/Hud';
import { Toast } from '../components/Toast';
import { DebugPanel } from '../components/DebugPanel';
import { CaptureWave } from '../components/CaptureWave';
import { TAB_BAR_BASE_HEIGHT } from '../components/TabBar';
import { COLORS } from '../theme';
import { heatColor, progressColor } from '../logic/color';
import { haversine } from '../logic/geo';

const UNDISCOVERED_STROKE = 'rgba(148, 163, 184, 0.55)';
const DISCOVERED_STROKE = 'rgba(34, 197, 94, 0.95)';
const TRACK_STROKE = 'rgba(79, 70, 229, 0.65)';

function toLatLng([lat, lon]: [number, number]) {
  return { latitude: lat, longitude: lon };
}

// Marge autour de la zone visible (en fraction du delta affiché) : évite que
// les tronçons/carrefours apparaissent/disparaissent trop brusquement en
// bordure d'écran pendant un pan.
const VIEWPORT_PAD = 0.6;

// Règles d'affichage par niveau de zoom pour les carrefours (voir aussi
// useWalkedia.ts pour les règles de chargement des zones) :
//  1. Zoomé : chaque carrefour individuellement, peu importe son éloignement
//     de la position du joueur — seul le viewport compte (voir plus bas).
//  2. Dézoomé au-delà de CLUSTER_LATITUDE_DELTA : regroupement en clusters,
//     dont la taille grandit en continu avec le dézoom (clusterCellMeters)
//     plutôt qu'une taille de cellule fixe — plus on dézoome, plus les
//     clusters sont gros et concentrés.
//  3. Dézoomé au point de voir plusieurs villes à la fois
//     (MAX_JUNCTION_RENDER_LATITUDE_DELTA) : plus aucun point/cluster
//     affiché, quelle que soit la donnée déjà en mémoire.
// Les tronçons (arêtes) ont leur propre cutoff, plus serré : ils deviennent
// illisibles/inutiles bien avant l'échelle pertinente pour les carrefours.
const MAX_EDGE_RENDER_LATITUDE_DELTA = 0.08; // ~9 km de hauteur visible
const MAX_JUNCTION_RENDER_LATITUDE_DELTA = 1.0; // ~111 km — "plusieurs villes"

// Plafonds absolus, indépendants du zoom : une zone très dense (centre-ville
// avec beaucoup d'exploration accumulée) peut dépasser un budget de rendu
// raisonnable même à un zoom normal. Priorité aux carrefours à plus haut
// degré (plus significatifs visuellement) et aux tronçons déjà découverts.
const MAX_RENDERED_JUNCTIONS = 300;
const MAX_RENDERED_EDGES = 600;

// Dézoomé au-delà de ce niveau, on affiche un badge "nombre de carrefours"
// par cellule de grille plutôt que chaque carrefour individuellement — plus
// lisible et beaucoup moins de Marker natifs à monter sur une vue large.
const CLUSTER_LATITUDE_DELTA = 0.025; // ~2.8 km de hauteur visible

// Taille de cellule de regroupement, calculée à partir de la hauteur visible
// plutôt que fixe : une fraction constante de ce qui est à l'écran donne un
// nombre de clusters à peu près stable quel que soit le zoom, donc des
// clusters visuellement plus gros/concentrés à mesure qu'on dézoome (règle
// 2). La fraction est calée pour retomber sur ~250 m (l'ancienne valeur
// fixe, à peu près un pâté de maisons) juste après CLUSTER_LATITUDE_DELTA,
// pour une transition continue au changement de mode.
const CLUSTER_CELL_FRACTION = 0.09;
const CLUSTER_CELL_MIN = 150; // m
const CLUSTER_CELL_MAX = 20000; // m

function clusterCellMeters(latitudeDelta: number) {
  const visibleHeightMeters = latitudeDelta * 110540;
  return Math.min(CLUSTER_CELL_MAX, Math.max(CLUSTER_CELL_MIN, visibleHeightMeters * CLUSTER_CELL_FRACTION));
}

interface JunctionCluster {
  key: string;
  lat: number;
  lon: number;
  total: number;
  done: number;
}

// Sous-ensemble animé des ondes de capture (voir CaptureWave) : seuls les N
// carrefours non complétés les plus proches pulsent réellement — animer un
// Marker force tracksViewChanges={true}, coûteux à grande échelle sur
// react-native-maps (voir le reste de ce fichier). Rayon d'entrée/de sortie
// asymétrique + recalcul seulement au-delà d'une distance parcourue : évite
// que la sélection scintille à cause du seul bruit GPS (même pattern que
// EXPAND_COOLDOWN/EXPAND_MARGIN dans useWalkedia.ts).
const ANIMATED_COUNT = 10;
const ANIMATED_RADIUS = 300; // m
const ANIMATED_EXIT_MARGIN = 80; // m
const ANIMATED_RECOMPUTE_DISTANCE = 15; // m

function regionBBox(region: Region) {
  const latPad = region.latitudeDelta * VIEWPORT_PAD;
  const lonPad = region.longitudeDelta * VIEWPORT_PAD;
  return {
    minLat: region.latitude - region.latitudeDelta / 2 - latPad,
    maxLat: region.latitude + region.latitudeDelta / 2 + latPad,
    minLon: region.longitude - region.longitudeDelta / 2 - lonPad,
    maxLon: region.longitude + region.longitudeDelta / 2 + lonPad,
  };
}

function coordsBBox(coords: [number, number][]) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lat, lon] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

function bboxIntersects(a: { minLat: number; maxLat: number; minLon: number; maxLon: number }, b: typeof a) {
  return a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLon <= b.maxLon && a.maxLon >= b.minLon;
}

export function MapScreen({ walkedia }: { walkedia: ReturnType<typeof import('../hooks/useWalkedia').useWalkedia> }) {
  const { state, actions } = walkedia;
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();

  // `region` reflète la zone réellement affichée par la carte native (mise à
  // jour par onRegionChangeComplete, y compris son premier appel juste après
  // le montage) ; tant qu'elle n'est pas connue, rien n'est filtré. Les
  // hooks doivent rester avant tout `return` conditionnel (ici le graphe/
  // centre pas encore prêts), donc ils gèrent eux-mêmes le cas `null`.
  const [region, setRegion] = useState<Region | null>(null);

  // Sous-ensemble animé des ondes de capture, avec hystérésis (voir
  // ANIMATED_* ci-dessus) — mutés directement en dehors de React state
  // volontairement : recalculer à chaque tick GPS ne doit pas déclencher un
  // re-render à part entière, `onFix` le fait déjà via rerender() côté
  // useWalkedia.
  const animatedSet = useRef<Set<string>>(new Set());
  const lastAnimatedCalcPos = useRef<{ lat: number; lon: number } | null>(null);

  const edges = state.graph ? [...state.graph.edges.values()] : [];
  const junctions = state.graph ? [...state.graph.junctions.values()] : [];

  // Le graphe complet reste toujours en mémoire (nécessaire pour que le
  // matching GPS et la progression fonctionnent même hors écran), mais on
  // n'affiche que ce qui est proche de la zone actuellement visible : moins
  // de traits/points natifs à dessiner sur la carte à mesure que la zone
  // connue grandit (pan vers de nouvelles zones). Mémoïsé sur le graphe et
  // la région pour ne pas recalculer à chaque tick (fix GPS, toast…).
  const { visibleEdges, visibleJunctions, junctionClusters } = useMemo(() => {
    if (!region) return { visibleEdges: edges, visibleJunctions: junctions, junctionClusters: [] as JunctionCluster[] };

    const viewBBox = regionBBox(region);

    // Tronçons : cutoff propre, plus serré que celui des carrefours (voir
    // constantes plus haut).
    let edgesInView: any[] = [];
    if (region.latitudeDelta <= MAX_EDGE_RENDER_LATITUDE_DELTA) {
      edgesInView = edges.filter((e: any) => bboxIntersects(coordsBBox(e.coords), viewBBox));
      if (edgesInView.length > MAX_RENDERED_EDGES) {
        const found: any[] = [];
        const rest: any[] = [];
        for (const e of edgesInView) (edgeIsFound(state, e.id) ? found : rest).push(e);
        edgesInView = found.length >= MAX_RENDERED_EDGES ? found.slice(0, MAX_RENDERED_EDGES) : found.concat(rest.slice(0, MAX_RENDERED_EDGES - found.length));
      }
    }

    // Carrefours : rien au-delà de l'échelle "plusieurs villes" (règle 3),
    // quelle que soit la donnée déjà chargée en mémoire.
    if (region.latitudeDelta > MAX_JUNCTION_RENDER_LATITUDE_DELTA) {
      return { visibleEdges: edgesInView, visibleJunctions: [], junctionClusters: [] as JunctionCluster[] };
    }

    const junctionsInView = junctions.filter(
      (j: any) => j.lat >= viewBBox.minLat && j.lat <= viewBBox.maxLat && j.lon >= viewBBox.minLon && j.lon <= viewBBox.maxLon
    );

    // Dézoomé : regroupe les carrefours du viewport par cellule de grille,
    // dont la taille grandit avec le dézoom (règle 2). Calculé sur TOUS les
    // carrefours du viewport, avant tout plafond individuel (sinon les
    // comptes par cellule seraient biaisés par un plafond qui privilégie le
    // haut degré).
    if (region.latitudeDelta > CLUSTER_LATITUDE_DELTA) {
      const cellMeters = clusterCellMeters(region.latitudeDelta);
      const kx = 111320 * Math.cos((region.latitude * Math.PI) / 180);
      const ky = 110540;
      const cells = new Map<string, { latSum: number; lonSum: number; total: number; done: number }>();
      for (const j of junctionsInView as any[]) {
        const key = Math.floor((j.lon * kx) / cellMeters) + ':' + Math.floor((j.lat * ky) / cellMeters);
        let c = cells.get(key);
        if (!c) cells.set(key, (c = { latSum: 0, lonSum: 0, total: 0, done: 0 }));
        c.latSum += j.lat;
        c.lonSum += j.lon;
        c.total++;
        if (junctionIsDone(state, j.id)) c.done++;
      }
      const clusters: JunctionCluster[] = [...cells.entries()].map(([key, c]) => ({
        key,
        lat: c.latSum / c.total,
        lon: c.lonSum / c.total,
        total: c.total,
        done: c.done,
      }));
      return { visibleEdges: edgesInView, visibleJunctions: [], junctionClusters: clusters };
    }

    // Zoomé : chaque carrefour individuellement, peu importe sa distance à
    // la position du joueur — seul le viewport compte (règle 1). Même
    // plafond que pour les tronçons (une zone dense peut dépasser un budget
    // de rendu raisonnable même à ce niveau de zoom) — priorité au haut degré.
    let pointJunctions = junctionsInView;
    if (pointJunctions.length > MAX_RENDERED_JUNCTIONS) {
      pointJunctions = [...pointJunctions]
        .sort((a: any, b: any) => b.requiredEdgeIds.size - a.requiredEdgeIds.size)
        .slice(0, MAX_RENDERED_JUNCTIONS);
    }

    return { visibleEdges: edgesInView, visibleJunctions: pointJunctions, junctionClusters: [] as JunctionCluster[] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.graph, region]);

  if (!state.graph || !state.center) return null;

  // Met à jour le sous-ensemble animé (voir ANIMATED_* et le ref plus haut).
  // Ne recalcule que si la position a assez bougé depuis le dernier calcul —
  // sinon garde le set précédent tel quel, y compris sa marge de sortie plus
  // large, pour ne pas faire clignoter les ondes au moindre bruit GPS.
  const pos = state.position;
  if (!pos) {
    animatedSet.current = new Set();
  } else {
    const last = lastAnimatedCalcPos.current;
    const moved = !last || haversine([last.lat, last.lon], [pos.lat, pos.lon]) > ANIMATED_RECOMPUTE_DISTANCE;
    if (moved) {
      lastAnimatedCalcPos.current = { lat: pos.lat, lon: pos.lon };
      const prev = animatedSet.current;
      const withDist = (visibleJunctions as any[])
        .filter((j) => !junctionIsDone(state, j.id))
        .map((j) => ({ j, dist: haversine([pos.lat, pos.lon], [j.lat, j.lon]) }));
      const kept = withDist.filter(({ j, dist }) => prev.has(j.id) && dist <= ANIMATED_RADIUS + ANIMATED_EXIT_MARGIN);
      const candidates = withDist.filter(({ dist }) => dist <= ANIMATED_RADIUS).sort((a, b) => a.dist - b.dist);
      const next = new Set<string>(kept.map(({ j }) => j.id));
      for (const { j } of candidates) {
        if (next.size >= ANIMATED_COUNT) break;
        next.add(j.id);
      }
      animatedSet.current = next;
    }
  }

  const [centerLat, centerLon] = state.center;

  let foundEdges = 0;
  for (const e of edges) if (edgeIsFound(state, e.id)) foundEdges++;
  let doneJunctions = 0;
  for (const j of junctions) if (junctionIsDone(state, j.id)) doneJunctions++;

  const recenter = () => {
    const target = actions.recenter();
    if (target && mapRef.current) {
      mapRef.current.animateToRegion(
        { latitude: target[0], longitude: target[1], latitudeDelta: 0.01, longitudeDelta: 0.01 },
        300
      );
    }
  };

  // Charge le réseau piéton (et les espaces verts) autour de la zone
  // affichée, pas seulement autour de la position GPS : en regardant ailleurs
  // sur la carte (pan/zoom), les points se chargent dès qu'on s'approche du
  // bord de la zone déjà connue — mêmes garde-fous que le suivi GPS
  // (cooldown, distance) puisque c'est le même maybeExpand. Met aussi à jour
  // la région affichée, utilisée pour n'afficher que les tronçons/carrefours
  // proches (voir visibleEdges/visibleJunctions ci-dessus).
  //
  // Trop dézoomé (> MAX_EXPAND_LATITUDE_DELTA de hauteur visible), on
  // n'auto-charge plus rien au pan (règle 3/4) : chaque zone ne couvre que
  // RADIUS=500 m (useWalkedia.ts), il en faudrait beaucoup pour remplir une
  // vue large, et enchaîner les requêtes Overpass à ce rythme serait du
  // gaspillage. Le rendu (visibleEdges/visibleJunctions/junctionClusters)
  // continue d'afficher ce qui est déjà connu, avec son propre cutoff bien
  // plus permissif pour les carrefours (voir MAX_JUNCTION_RENDER_LATITUDE_DELTA).
  const MAX_EXPAND_LATITUDE_DELTA = 0.03; // ~3.3 km de hauteur visible

  const onRegionChangeComplete = (newRegion: Region) => {
    setRegion(newRegion);
    if (newRegion.latitudeDelta > MAX_EXPAND_LATITUDE_DELTA) return;
    actions.maybeExpand(newRegion.latitude, newRegion.longitude, { announceSkip: true });
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: centerLat, longitude: centerLon, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        showsUserLocation={false}
        rotateEnabled={false}
        onRegionChangeComplete={onRegionChangeComplete}
      >
        <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />

        {visibleEdges.map((e: any) => {
          const found = edgeIsFound(state, e.id);
          // Arêtes découvertes avant l'ajout du compteur de passages : pas
          // encore de edgeVisits enregistré, on suppose au moins 1 passage
          // plutôt que de les faire soudain apparaître "sans couleur".
          const visits = found ? state.progress.edgeVisits[e.id] ?? 1 : 0;
          const strokeColor = found ? heatColor(visits) ?? DISCOVERED_STROKE : UNDISCOVERED_STROKE;
          return (
            <Polyline
              key={e.id}
              coordinates={e.coords.map(toLatLng)}
              strokeColor={strokeColor}
              strokeWidth={found ? 4.5 : 2.5}
              zIndex={found ? 2 : 1}
            />
          );
        })}

        {state.session && state.session.track.length > 1 && (
          <Polyline
            coordinates={state.session.track.map(toLatLng)}
            strokeColor={TRACK_STROKE}
            strokeWidth={3}
            lineDashPattern={[4, 6]}
            zIndex={3}
          />
        )}

        {junctionClusters.map((c) => {
          const ratio = c.total > 0 ? c.done / c.total : 0;
          return (
            <Marker
              key={`cluster-${c.key}`}
              coordinate={{ latitude: c.lat, longitude: c.lon }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              zIndex={4}
            >
              <View style={[styles.clusterBadge, { backgroundColor: progressColor(ratio) }]}>
                <Text style={styles.clusterBadgeText}>{c.total}</Text>
              </View>
            </Marker>
          );
        })}

        {visibleJunctions.map((j: any) => {
          const done = junctionIsDone(state, j.id);
          const animated = !done && animatedSet.current.has(j.id);
          return (
            <Marker
              key={j.id}
              coordinate={{ latitude: j.lat, longitude: j.lon }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={animated}
              zIndex={done ? 5 : 4}
            >
              <CaptureWave done={done} animated={animated} />
            </Marker>
          );
        })}

        {state.position && (
          <>
            <Circle
              center={{ latitude: state.position.lat, longitude: state.position.lon }}
              radius={state.position.accuracy || 0}
              strokeColor="rgba(59,130,246,0.3)"
              fillColor="rgba(59,130,246,0.08)"
            />
            <Marker
              coordinate={{ latitude: state.position.lat, longitude: state.position.lon }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.positionDot} />
            </Marker>
          </>
        )}
      </MapView>

      <Hud score={state.progress.junctions.size} edgesLabel={`${foundEdges}/${edges.length}`} interLabel={`${doneJunctions}/${junctions.length}`} />

      <DebugPanel onSimulate={actions.simulateWalk} />

      <View style={[styles.controls, { bottom: insets.bottom + TAB_BAR_BASE_HEIGHT + 14 }]}>
        <TouchableOpacity
          style={[styles.sessionBtn, state.session && styles.sessionBtnRecording]}
          onPress={() => (state.session ? actions.endSession() : actions.startSession())}
        >
          <Text style={styles.sessionBtnText}>{state.session ? 'Terminer la session' : 'Démarrer une session'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.centerBtn} onPress={recenter}>
          <Text style={styles.centerBtnText}>⌖</Text>
        </TouchableOpacity>
      </View>

      <Toast message={state.toast?.msg ?? null} />
    </View>
  );
}

const styles = StyleSheet.create({
  clusterBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(15, 23, 42, 0.6)',
  },
  clusterBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  positionDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.position,
    borderWidth: 2.5,
    borderColor: '#fff',
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  sessionBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  sessionBtnRecording: { backgroundColor: COLORS.recording, shadowColor: COLORS.recording },
  sessionBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  centerBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  centerBtnText: { color: COLORS.text, fontSize: 22, lineHeight: 22 },
});
