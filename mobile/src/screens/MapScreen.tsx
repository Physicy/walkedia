import React, { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, UrlTile } from 'react-native-maps';

import { edgeIsFound, junctionIsDone } from '../hooks/useWalkedia';
import { Hud } from '../components/Hud';
import { Toast } from '../components/Toast';
import { DebugPanel } from '../components/DebugPanel';
import { COLORS } from '../theme';

function toLatLng([lat, lon]: [number, number]) {
  return { latitude: lat, longitude: lon };
}

export function MapScreen({ walkedia }: { walkedia: ReturnType<typeof import('../hooks/useWalkedia').useWalkedia> }) {
  const { state, actions } = walkedia;
  const mapRef = useRef<MapView>(null);

  if (!state.graph || !state.center) return null;

  const [centerLat, centerLon] = state.center;

  const edges = [...state.graph.edges.values()];
  const junctions = [...state.graph.junctions.values()];

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

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: centerLat, longitude: centerLon, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        showsUserLocation={false}
        rotateEnabled={false}
      >
        <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />

        {edges.map((e: any) => {
          const found = edgeIsFound(state, e.id);
          return (
            <Polyline
              key={e.id}
              coordinates={e.coords.map(toLatLng)}
              strokeColor={found ? COLORS.discovered : COLORS.undiscovered}
              strokeWidth={found ? 4.5 : 2.5}
            />
          );
        })}

        {state.session && state.session.track.length > 1 && (
          <Polyline
            coordinates={state.session.track.map(toLatLng)}
            strokeColor={COLORS.track}
            strokeWidth={3}
            lineDashPattern={[4, 6]}
          />
        )}

        {junctions.map((j: any) => {
          const done = junctionIsDone(state, j.id);
          return (
            <Marker key={j.id} coordinate={{ latitude: j.lat, longitude: j.lon }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View
                style={[
                  styles.junctionDot,
                  {
                    width: done ? 14 : 11,
                    height: done ? 14 : 11,
                    borderRadius: done ? 7 : 5.5,
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

      <View style={styles.controls}>
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
    bottom: 74,
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
  },
  sessionBtnRecording: { backgroundColor: COLORS.recording },
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
  },
  centerBtnText: { color: COLORS.text, fontSize: 22, lineHeight: 22 },
});
