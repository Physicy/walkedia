import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Circle, Marker, Polyline, Region, UrlTile } from 'react-native-maps';

import { edgeIsFound, junctionIsDone } from '../hooks/useWalkedia';
import { ReleveBar, BoutonRecentrer, ObjectifCard, PanneauPret, PanneauSession, FilEntree } from '../components/MapChrome';
import { PointGagneVoile } from '../components/PointGagneVoile';
import { SessionSummary } from '../components/SessionSummary';
import { JunctionSheet } from '../components/JunctionSheet';
import { Toast } from '../components/Toast';
import { DebugPanel } from '../components/DebugPanel';
import { LoadMonitorPanel } from '../components/LoadMonitorPanel';
import { CaptureWave } from '../components/CaptureWave';
import { tabBarHeight } from '../components/TabBar';
import { COLORS } from '../theme';
import { heatColor, progressColor, nuancesTrace, rgbaTrace } from '../logic/color';
import { haversine } from '../logic/geo';
import { branchesForGlyph, orientationsManquantes, objectifLePlusProche, pointNumber } from '../logic/junctionInfo';

const UNDISCOVERED_STROKE = 'rgba(26, 27, 46, 0.22)';

function toLatLng([lat, lon]: [number, number]) {
  return { latitude: lat, longitude: lon };
}

function formatDuree(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
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
const MAX_JUNCTION_RENDER_LATITUDE_DELTA = 4.5; // ~500 km — échelle "pays"

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
// Doit rester au-dessus de MAX_JUNCTION_RENDER_LATITUDE_DELTA × 110540 ×
// CLUSTER_CELL_FRACTION, sinon la cellule cesse de grandir avec le dézoom et
// c'est toute la propriété "nombre de badges constant" qui tombe : à 500 km de
// hauteur visible, un plafond à 20 km donnerait ~1000 cellules au lieu de
// ~150, autant de marqueurs natifs montés d'un coup.
const CLUSTER_CELL_MAX = 60000; // m

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

  // Accent choisi par le joueur (voir logic/prefs.ts, traceColor) : remplace
  // le violet fixe pour tout ce qui est "géométrie parcourue ou point gagné"
  // sur la carte elle-même — le halo autour d'un carrefour, un tronçon déjà
  // découvert, le tracé de la session en cours. La géométrie pas encore
  // marchée (gris) et le chrome (boutons, onglets) restent en encre, hors
  // scope de cette personnalisation.
  const nuances = nuancesTrace(state.traceColor);
  const DISCOVERED_STROKE = state.traceColor;
  const TRACK_STROKE = nuances.clair;

  // `region` reflète la zone réellement affichée par la carte native (mise à
  // jour par onRegionChangeComplete, y compris son premier appel juste après
  // le montage) ; tant qu'elle n'est pas connue, rien n'est filtré. Les
  // hooks doivent rester avant tout `return` conditionnel (ici le graphe/
  // centre pas encore prêts), donc ils gèrent eux-mêmes le cas `null`.
  const [region, setRegion] = useState<Region | null>(null);
  const [showLoadMonitor, setShowLoadMonitor] = useState(false);

  // Hauteur réelle du panneau du bas (prêt/session), mesurée plutôt que
  // devinée : ses deux états n'ont pas la même hauteur (le panneau de session
  // a des compteurs et un fil en plus), et une valeur en dur se déréglerait au
  // moindre changement de contenu. La carte d'objectif se cale juste au-dessus.
  const [hauteurSocle, setHauteurSocle] = useState(0);
  const onLayoutSocle = (e: LayoutChangeEvent) => setHauteurSocle(e.nativeEvent.layout.height);

  // Fiche de carrefour, ouverte en touchant un point sur la carte. Seulement
  // pour un carrefour dont la géométrie complète est en mémoire (state.graph) :
  // un point venu de `discovered` seul (zone repliée depuis) n'a pas de
  // requiredEdgeIds à afficher, la fiche n'aurait rien à montrer.
  const [junctionOuvert, setJunctionOuvert] = useState<string | null>(null);

  // Fait vivre le compteur de durée du panneau de session (voir
  // PanneauSession) sans dépendre d'un nouveau fix GPS pour se rafraîchir —
  // purement local, ne touche pas à l'état du hook.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!state.session) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [state.session]);

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
    // constantes plus haut) — mais seulement pour ce qui n'est PAS encore
    // parcouru. Le tracé personnel (la trace violette) reste visible à
    // n'importe quel dézoom : c'est un historique, pas une aide au jeu en
    // cours, et le faire disparaître en dézoomant serait perdre de vue ce
    // qu'on a déjà exploré. `edgeIsFound` reste bon marché (lookup dans deux
    // Sets), donc filtrer par viewport suffit à garder un nombre raisonnable
    // de traits même dézoomé.
    let edgesInView: any[] = [];
    if (region.latitudeDelta <= MAX_EDGE_RENDER_LATITUDE_DELTA) {
      edgesInView = edges.filter((e: any) => bboxIntersects(coordsBBox(e.coords), viewBBox));
      if (edgesInView.length > MAX_RENDERED_EDGES) {
        const found: any[] = [];
        const rest: any[] = [];
        for (const e of edgesInView) (edgeIsFound(state, e.id) ? found : rest).push(e);
        edgesInView = found.length >= MAX_RENDERED_EDGES ? found.slice(0, MAX_RENDERED_EDGES) : found.concat(rest.slice(0, MAX_RENDERED_EDGES - found.length));
      }
    } else {
      edgesInView = edges.filter((e: any) => edgeIsFound(state, e.id) && bboxIntersects(coordsBBox(e.coords), viewBBox));
      if (edgesInView.length > MAX_RENDERED_EDGES) edgesInView = edgesInView.slice(0, MAX_RENDERED_EDGES);
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

  // Carte d'objectif : le carrefour incomplet le plus proche de la position
  // (ou du centre chargé, avant tout fix GPS), recalculé à chaque rendu — bon
  // marché (une passe sur les carrefours déjà en mémoire, voir
  // junctionInfo.ts), et toujours à jour sans état séparé à invalider.
  // La carte d'objectif ne sert qu'au tout début : une fois que le joueur a
  // décroché quelques points, il sait reconnaître un carrefour incomplet sur
  // la carte lui-même (le glyphe le montre déjà) — la carte devient alors une
  // redite plutôt qu'une aide.
  const SEUIL_DEBUTANT = 3;
  const objectifPos: [number, number] = pos ? [pos.lat, pos.lon] : [centerLat, centerLon];
  const objectif = state.graph ? objectifLePlusProche(state.graph, state.progress.junctions, objectifPos) : null;
  const objectifBranches = objectif ? branchesForGlyph(state.graph!, objectif.junction, state.progress.edges) : [];
  const objectifManque = objectif ? orientationsManquantes(state.graph!, objectif.junction, state.progress.edges) : [];

  // File d'attente des points gagnés (voir PointGagne) : montré un par un,
  // plein écran, par-dessus tout le reste — y compris pendant une session
  // active, qui continue de tourner derrière.
  const pointGagne = state.pointsGagnes[0];
  const junctionPointGagne = pointGagne && state.graph ? state.graph.junctions.get(pointGagne.junctionId) : null;

  // Fil de la session en cours : les derniers gains, les plus récents
  // d'abord. Pas de nom de rue (voir MapChrome.tsx) : seulement le type et
  // l'ancienneté, dérivés de discovered.edges / progress.completedAt.
  const fil: FilEntree[] = [];
  if (state.session) {
    for (const id of state.session.newEdges) {
      const at = state.discovered.edges.get(id)?.at;
      if (at != null) fil.push({ id, type: 'troncon', at });
    }
    for (const id of state.session.newInter) {
      const at = state.progress.completedAt[id];
      if (at != null) fil.push({ id, type: 'carrefour', at });
    }
    fil.sort((a, b) => b.at - a.at);
  }

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
              onPress={() => setJunctionOuvert(j.id)}
            >
              <CaptureWave done={done} animated={animated} couleur={state.traceColor} />
            </Marker>
          );
        })}

        {state.position && (
          <>
            <Circle
              center={{ latitude: state.position.lat, longitude: state.position.lon }}
              radius={state.position.accuracy || 0}
              strokeColor={rgbaTrace(state.traceColor, 0.28)}
              fillColor={rgbaTrace(state.traceColor, 0.08)}
            />
            <Marker
              coordinate={{ latitude: state.position.lat, longitude: state.position.lon }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={[styles.positionDot, { backgroundColor: state.traceColor }]} />
            </Marker>
          </>
        )}
      </MapView>

      <View style={[styles.haut, { top: insets.top + 10 }]}>
        <ReleveBar trouves={foundEdges} total={edges.length} couleur={state.traceColor} />
        <BoutonRecentrer onPress={recenter} />
      </View>

      {objectif && state.progress.junctions.size < SEUIL_DEBUTANT && (
        <View style={[styles.objectifWrap, { bottom: tabBarHeight(insets.bottom) + hauteurSocle + 10 }]}>
          <ObjectifCard
            branches={objectifBranches}
            eyebrow={state.session ? 'En cours de relevé' : 'Prochain point'}
            numero={state.progress.junctions.size + 1}
            manque={objectifManque}
            distance={objectif.distance}
            couleur={state.traceColor}
          />
        </View>
      )}

      <View style={[styles.bas, { bottom: tabBarHeight(insets.bottom) }]} onLayout={onLayoutSocle}>
        {state.session ? (
          <PanneauSession
            duree={formatDuree(Date.now() - state.session.startedAt)}
            km={sessionKm(state.session.track)}
            gain={state.session.newEdges.size}
            fil={fil}
            onTerminer={() => actions.endSession()}
          />
        ) : (
          <PanneauPret
            marcheDetectee={state.marcheDetectee}
            onImporterMarche={actions.importerMarcheDetectee}
            onIgnorerMarche={actions.ignorerMarcheDetectee}
            onDemarrer={actions.startSession}
          />
        )}
      </View>

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

      <Toast message={state.toast?.msg ?? null} />

      {pointGagne && junctionPointGagne && state.graph && (
        <PointGagneVoile
          numero={pointGagne.numero}
          nouvelles={pointGagne.nouvelles}
          total={pointGagne.total}
          branches={branchesForGlyph(state.graph, junctionPointGagne, state.progress.edges)}
          totalPoints={state.progress.junctions.size}
          totalTroncons={state.progress.edges.size}
          kmReleves={state.progress.edgeMeters / 1000}
          onContinuer={actions.dismissPointGagne}
          couleur={state.traceColor}
        />
      )}

      {state.sortieResume && <SessionSummary resume={state.sortieResume} onFermer={actions.dismissSortieResume} />}

      {junctionOuvert && state.graph?.junctions.get(junctionOuvert) && (
        <JunctionSheet
          numero={pointNumber(state.progress, junctionOuvert)}
          branches={branchesForGlyph(state.graph, state.graph.junctions.get(junctionOuvert)!, state.progress.edges)}
          onFermer={() => setJunctionOuvert(null)}
          couleur={state.traceColor}
        />
      )}
    </View>
  );
}

// Distance parcourue pendant la session (compteur live du panneau, voir
// PanneauSession) : longueur de la trace GPS brute, distincte des mètres
// crédités dans la progression (qui ne comptent qu'une fois par tronçon,
// jamais une revisite). L'écart entre les deux est justement ce que
// SessionSummary explique en fin de sortie.
function sessionKm(track: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < track.length; i++) total += haversine(track[i - 1], track[i]);
  return total / 1000;
}

const styles = StyleSheet.create({
  haut: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  objectifWrap: { position: 'absolute', left: 14, right: 14, zIndex: 9 },
  bas: { position: 'absolute', left: 0, right: 0, zIndex: 10 },

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
    borderColor: 'rgba(251, 250, 253, 0.7)',
  },
  clusterBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  positionDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: '#fff',
  },
});
