import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Circle, Marker, Polyline, Region, UrlTile } from 'react-native-maps';

import { edgeIsFound, junctionIsDone } from '../hooks/useWalkedia';
import { Hud } from '../components/Hud';
import { Toast } from '../components/Toast';
import { DebugPanel } from '../components/DebugPanel';
import { LoadMonitorPanel } from '../components/LoadMonitorPanel';
import { CaptureWave } from '../components/CaptureWave';
import { TAB_BAR_BASE_HEIGHT } from '../components/TabBar';
import { COLORS } from '../theme';
import { heatColor, progressColor } from '../logic/color';
import { haversine } from '../logic/geo';

// Cellules estimées : volontairement neutres et translucides, pour se
// distinguer au premier coup d'œil des badges colorés par la progression
// réelle (voir progressColor).
const ESTIMATED_CLUSTER_BG = 'rgba(71, 85, 105, 0.45)';
const ESTIMATED_CLUSTER_BORDER = 'rgba(226, 232, 240, 0.45)';

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

// Rayon d'une zone servie par get-region : sert à convertir le nombre de
// carrefours d'une zone chargée en densité (carrefours/km²), pour estimer les
// cellules dont la zone n'est pas chargée. Doit suivre RADIUS dans
// useWalkedia.ts.
const REGION_RADIUS_M = 500;

// Plafond de cellules estimées calculées pour un viewport. La taille de
// cellule étant une fraction de la hauteur visible, le compte est
// naturellement stable (~150) : ce plafond n'est qu'un garde-fou.
const MAX_ESTIMATED_CELLS = 400;

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
  // Cellule dont la zone n'est pas chargée : `total` est une extrapolation de
  // densité, `done` n'est pas connu. Affiché différemment pour ne jamais
  // laisser croire à un décompte réel (voir le rendu des badges).
  estimated?: boolean;
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
  const [showLoadMonitor, setShowLoadMonitor] = useState(false);

  // Sous-ensemble animé des ondes de capture, avec hystérésis (voir
  // ANIMATED_* ci-dessus) — mutés directement en dehors de React state
  // volontairement : recalculer à chaque tick GPS ne doit pas déclencher un
  // re-render à part entière, `onFix` le fait déjà via rerender() côté
  // useWalkedia.
  const animatedSet = useRef<Set<string>>(new Set());
  const lastAnimatedCalcPos = useRef<{ lat: number; lon: number } | null>(null);

  // Deux sources de géométrie, fusionnées ici :
  //  - `state.graph`, le réseau de la zone chargée depuis le serveur (tout le
  //    réseau, découvert ou non) ;
  //  - `state.discovered`, ce que le joueur a déjà parcouru, persisté
  //    localement (logic/discovered.ts) et donc disponible dès l'ouverture,
  //    même pour des quartiers dont la zone n'est pas (ou plus) chargée.
  // Le graphe prime quand un ID est présent des deux côtés : il porte les
  // attributs complets (car/oneway/…), la version persistée n'a que la
  // polyligne. Le vert « découvert » comme la heatmap sortent tous deux de
  // `progress` (voir le rendu plus bas), donc les deux sources s'affichent
  // exactement pareil.
  const { edges, junctions } = useMemo(() => {
    const e: any[] = state.graph ? [...state.graph.edges.values()] : [];
    const vus = new Set(e.map((x) => x.id));
    for (const [id, d] of state.discovered.edges) {
      if (!vus.has(id)) e.push({ id, coords: d.coords, length: d.length });
    }
    const j: any[] = state.graph ? [...state.graph.junctions.values()] : [];
    const vusJ = new Set(j.map((x) => x.id));
    for (const [id, [lat, lon]] of state.discovered.junctions) {
      if (!vusJ.has(id)) j.push({ id, lat, lon, requiredEdgeIds: new Set<string>() });
    }
    return { edges: e, junctions: j };
    // `discovered` est muté en place (comme tout l'état de useWalkedia) : on
    // se raccroche à sa taille, qui change à chaque nouvel élément mémorisé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.graph, state.discovered.edges.size, state.discovered.junctions.size]);

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

      // 1. Comptage EXACT là où la zone est chargée.
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

      const clusters: JunctionCluster[] = [];
      for (const [key, c] of cells) {
        clusters.push({ key, lat: c.latSum / c.total, lon: c.lonSum / c.total, total: c.total, done: c.done });
      }

      // 2. Remplissage ESTIMÉ partout ailleurs dans le viewport. Le but est
      //    d'avoir une carte lisible au dézoom sans télécharger des dizaines
      //    de zones : au-delà d'un certain niveau, charger pour compter
      //    exactement coûterait bien plus que ça ne rapporte visuellement.
      //    La densité vient de la zone chargée la plus proche (voir
      //    regionStats) — pas d'une constante, parce qu'entre un centre-ville
      //    et la campagne l'écart est d'un ordre de grandeur.
      const stats = state.regionStats;
      if (stats.length) {
        const cellAreaKm2 = (cellMeters / 1000) ** 2;
        const zoneAreaKm2 = Math.PI * (REGION_RADIUS_M / 1000) ** 2;
        const minCx = Math.floor((viewBBox.minLon * kx) / cellMeters);
        const maxCx = Math.floor((viewBBox.maxLon * kx) / cellMeters);
        const minCy = Math.floor((viewBBox.minLat * ky) / cellMeters);
        const maxCy = Math.floor((viewBBox.maxLat * ky) / cellMeters);

        // Garde-fou : la taille de cellule étant une fraction de la hauteur
        // visible, le viewport en contient un nombre à peu près constant —
        // mais une projection extrême ou un viewport très allongé pourrait
        // faire déraper le compte.
        const nbCells = (maxCx - minCx + 1) * (maxCy - minCy + 1);
        if (nbCells <= MAX_ESTIMATED_CELLS) {
          for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
              const key = cx + ':' + cy;
              if (cells.has(key)) continue; // déjà compté exactement
              const lat = ((cy + 0.5) * cellMeters) / ky;
              const lon = ((cx + 0.5) * cellMeters) / kx;
              let best = stats[0];
              let bestDist = Infinity;
              for (const s of stats) {
                const d = haversine([lat, lon], s.center);
                if (d < bestDist) {
                  bestDist = d;
                  best = s;
                }
              }
              const estimation = Math.round((best.junctions / zoneAreaKm2) * cellAreaKm2);
              if (estimation < 1) continue;
              clusters.push({ key, lat, lon, total: estimation, done: 0, estimated: true });
            }
          }
        }
      }

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
  }, [edges, junctions, region]);

  // Plus de garde sur `state.graph` : la carte s'affiche dès que la position
  // est connue, avec l'historique persisté, pendant que la zone charge.
  if (!state.center) return null;

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
  // Le seuil de dézoom au-delà duquel on arrête de charger (règle 3/4) vit
  // désormais dans useWalkedia.ts (MAX_EXPAND_LATITUDE_DELTA) : maybeExpand
  // reçoit latitudeDelta et décide lui-même, pour que ce skip soit aussi
  // journalisé (voir loadLog / LoadMonitorPanel) comme toute autre décision
  // de chargement. Le rendu (visibleEdges/visibleJunctions/junctionClusters)
  // continue d'afficher ce qui est déjà connu, avec son propre cutoff bien
  // plus permissif pour les carrefours (MAX_JUNCTION_RENDER_LATITUDE_DELTA).
  const onRegionChangeComplete = (newRegion: Region) => {
    setRegion(newRegion);
    actions.maybeExpand(newRegion.latitude, newRegion.longitude, {
      trigger: 'pan',
      latitudeDelta: newRegion.latitudeDelta,
      announceSkip: true,
    });
    // Mode cluster (dézoomé) : complète activement la zone visible plutôt
    // que de n'avoir des clusters que sur ce qui a déjà été chargé ailleurs
    // (voir MAX_GRID_LOAD_LATITUDE_DELTA dans useWalkedia.ts pour le
    // plafond au-delà duquel ça s'arrête).
    if (newRegion.latitudeDelta > CLUSTER_LATITUDE_DELTA) {
      actions.loadVisibleGrid(newRegion.latitude, newRegion.longitude, newRegion.latitudeDelta, newRegion.longitudeDelta);
    }
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
          // Une cellule estimée n'a pas de progression connue : la colorer
          // comme une cellule à 0 % complété ferait passer une inconnue pour
          // une certitude. Elle reste neutre, translucide, et son nombre est
          // préfixé d'un « ~ ».
          return (
            <Marker
              key={`cluster-${c.key}`}
              coordinate={{ latitude: c.lat, longitude: c.lon }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              zIndex={c.estimated ? 3 : 4}
            >
              <View
                style={[
                  styles.clusterBadge,
                  c.estimated
                    ? { backgroundColor: ESTIMATED_CLUSTER_BG, borderWidth: 1, borderColor: ESTIMATED_CLUSTER_BORDER }
                    : { backgroundColor: progressColor(ratio) },
                ]}
              >
                <Text style={[styles.clusterBadgeText, c.estimated && styles.clusterBadgeTextEstimated]}>
                  {c.estimated ? `~${c.total}` : c.total}
                </Text>
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

      {__DEV__ && (
        <TouchableOpacity
          style={[styles.monitorToggle, { top: insets.top + 122 }]}
          onPress={() => setShowLoadMonitor((v) => !v)}
          accessibilityLabel="Monitoring du chargement des zones (debug)"
        >
          <Text style={styles.monitorToggleIcon}>📡</Text>
        </TouchableOpacity>
      )}
      {showLoadMonitor && <LoadMonitorPanel log={state.loadLog} />}

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
  monitorToggle: {
    position: 'absolute',
    right: 12,
    zIndex: 1000,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monitorToggleIcon: { fontSize: 16 },
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
  clusterBadgeTextEstimated: { color: 'rgba(255, 255, 255, 0.85)', fontWeight: '600' },
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
