import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Circle, Marker, Polyline, Region, UrlTile } from 'react-native-maps';

import { edgeIsFound, junctionIsDone } from '../hooks/useWalkedia';
import { Hud } from '../components/Hud';
import { Toast } from '../components/Toast';
import { DebugPanel } from '../components/DebugPanel';
import { TAB_BAR_BASE_HEIGHT } from '../components/TabBar';
import { COLORS } from '../theme';

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

// Au-delà de cette hauteur visible, on n'affiche plus rien : sans plafond,
// dézoomer beaucoup fait soudainement rentrer TOUTES les zones déjà chargées
// dans le filtre viewport (potentiellement des milliers de Marker/Polyline
// natifs à monter d'un coup), ce qui fige l'app le temps du rendu. Un peu
// plus permissif que le seuil de chargement (voir onRegionChangeComplete) :
// entre les deux, on voit encore ce qui est déjà connu sans en recharger.
const MAX_RENDER_LATITUDE_DELTA = 0.08; // ~9 km de hauteur visible

// Plafonds absolus, indépendants du zoom : une zone très dense (centre-ville
// avec beaucoup d'exploration accumulée) peut dépasser un budget de rendu
// raisonnable même à un zoom normal. Priorité aux carrefours à plus haut
// degré (plus significatifs visuellement) et aux tronçons déjà découverts.
const MAX_RENDERED_JUNCTIONS = 300;
const MAX_RENDERED_EDGES = 600;

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

  const edges = state.graph ? [...state.graph.edges.values()] : [];
  const junctions = state.graph ? [...state.graph.junctions.values()] : [];

  // Le graphe complet reste toujours en mémoire (nécessaire pour que le
  // matching GPS et la progression fonctionnent même hors écran), mais on
  // n'affiche que ce qui est proche de la zone actuellement visible : moins
  // de traits/points natifs à dessiner sur la carte à mesure que la zone
  // connue grandit (pan vers de nouvelles zones). Mémoïsé sur le graphe et
  // la région pour ne pas recalculer à chaque tick (fix GPS, toast…).
  const { visibleEdges, visibleJunctions } = useMemo(() => {
    if (!region) return { visibleEdges: edges, visibleJunctions: junctions };
    if (region.latitudeDelta > MAX_RENDER_LATITUDE_DELTA) return { visibleEdges: [], visibleJunctions: [] };

    const viewBBox = regionBBox(region);
    let edgesInView = edges.filter((e: any) => bboxIntersects(coordsBBox(e.coords), viewBBox));
    let junctionsInView = junctions.filter(
      (j: any) => j.lat >= viewBBox.minLat && j.lat <= viewBBox.maxLat && j.lon >= viewBBox.minLon && j.lon <= viewBBox.maxLon
    );

    // Plafonds : une zone très dense peut dépasser un budget de rendu
    // raisonnable même dans le viewport. On garde les carrefours les plus
    // significatifs (haut degré) et les tronçons déjà découverts en priorité.
    if (junctionsInView.length > MAX_RENDERED_JUNCTIONS) {
      junctionsInView = [...junctionsInView]
        .sort((a: any, b: any) => b.requiredEdgeIds.size - a.requiredEdgeIds.size)
        .slice(0, MAX_RENDERED_JUNCTIONS);
    }
    if (edgesInView.length > MAX_RENDERED_EDGES) {
      const found: any[] = [];
      const rest: any[] = [];
      for (const e of edgesInView) (edgeIsFound(state, e.id) ? found : rest).push(e);
      edgesInView = found.length >= MAX_RENDERED_EDGES ? found.slice(0, MAX_RENDERED_EDGES) : found.concat(rest.slice(0, MAX_RENDERED_EDGES - found.length));
    }

    return { visibleEdges: edgesInView, visibleJunctions: junctionsInView };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.graph, region]);

  if (!state.graph || !state.center) return null;

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
  // n'auto-charge plus rien au pan : chaque zone ne couvre que RADIUS=800 m,
  // il en faudrait beaucoup pour remplir une vue très large, les points y
  // seraient de toute façon minuscules/inutilisables, et enchaîner les
  // requêtes Overpass à ce rythme serait juste du gaspillage. Le rendu
  // (visibleEdges/visibleJunctions) continue d'afficher ce qui est déjà connu.
  const MAX_EXPAND_LATITUDE_DELTA = 0.05; // ~5.5 km de hauteur visible

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
          return (
            <Polyline
              key={e.id}
              coordinates={e.coords.map(toLatLng)}
              strokeColor={found ? DISCOVERED_STROKE : UNDISCOVERED_STROKE}
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

        {visibleJunctions.map((j: any) => {
          const done = junctionIsDone(state, j.id);
          return (
            <Marker
              key={j.id}
              coordinate={{ latitude: j.lat, longitude: j.lon }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              opacity={done ? 1 : 0.8}
              zIndex={done ? 5 : 4}
            >
              <View
                style={[
                  styles.junctionDot,
                  {
                    width: done ? 13 : 9,
                    height: done ? 13 : 9,
                    borderRadius: done ? 6.5 : 4.5,
                    backgroundColor: done ? COLORS.complete : COLORS.incomplete,
                  },
                ]}
              />
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
  junctionDot: { borderWidth: 1.5, borderColor: '#0f172a' },
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
