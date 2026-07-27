import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { startLocationTracking, stopLocationTracking } from '../services/locationService.js';
import { loadProgress, saveProgress, saveSession } from '../services/storageService.js';
import { makeProj } from '../../../shared/utils/geo.js';
import { buildGraph } from '../../../shared/utils/graph.js';
import { Matcher } from '../../../shared/utils/matching.js';
import { fetchNetwork } from '../../../shared/utils/overpass.js';
import type { LocationFix, Session, StorageData, Graph } from '../../../shared/types/index.js';

const INITIAL_LAT = 48.8566;
const INITIAL_LON = 2.3522;
const RADIUS = 800;
const ZONE_EXTEND_THRESHOLD = 300;

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [score, setScore] = useState(0);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [progress, setProgress] = useState<StorageData | null>(null);
  const [edges, setEdges] = useState<string[]>([]);
  const [junctions, setJunctions] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const matcherRef = useRef<Matcher | null>(null);
  const sessionFixesRef = useRef<LocationFix[]>([]);
  const lastZoneExtendRef = useRef<number>(0);

  // Initialize graph and load progress
  useEffect(() => {
    async function init() {
      try {
        const data = await loadProgress();
        setProgress(data);
        setScore(data.edges.size); // Approximation

        // Load initial graph
        const osmData = await fetchNetwork(INITIAL_LAT, INITIAL_LON, RADIUS);
        const builtGraph = buildGraph({
          nodes: osmData.nodes,
          ways: osmData.ways,
        } as any);
        setGraph(builtGraph);
      } catch (error) {
        Alert.alert('Error', 'Failed to initialize graph: ' + String(error));
      }
    }
    init();
  }, []);

  // Location tracking
  useEffect(() => {
    startLocationTracking(async (fix: LocationFix) => {
      setPosition({ lat: fix.lat, lon: fix.lon });

      if (!graph) return;

      // Check if we need to extend zone
      const now = Date.now();
      if (now - lastZoneExtendRef.current > 30000) {
        // Don't extend too frequently
        const dist = haversineSimple(INITIAL_LAT, INITIAL_LON, fix.lat, fix.lon);
        if (dist > RADIUS - ZONE_EXTEND_THRESHOLD) {
          try {
            lastZoneExtendRef.current = now;
            const osmData = await fetchNetwork(fix.lat, fix.lon, RADIUS);
            const newGraph = buildGraph({
              nodes: osmData.nodes,
              ways: osmData.ways,
            } as any);
            setGraph(newGraph);
          } catch (error) {
            console.error('Zone extension failed:', error);
          }
        }
      }

      // Feed to matcher if recording
      if (isRecording && matcherRef.current) {
        const proj = makeProj(fix.lat);
        const newEdges = matcherRef.current.feed(fix.lat, fix.lon, fix.accuracy);
        if (newEdges.length > 0) {
          setEdges((e) => [...e, ...newEdges]);
        }
        sessionFixesRef.current.push(fix);

        // Check for excessive speed (auto-stop)
        if (fix.speedKmh && fix.speedKmh > 20) {
          // Would need to track consecutive high-speed fixes
          // For now, just log
        }
      }
    });

    return () => {
      stopLocationTracking();
    };
  }, [graph, isRecording]);

  async function startSession() {
    if (!graph || !position) return;
    const id = Math.random().toString(36).slice(2);
    setSessionId(id);
    setIsRecording(true);
    sessionFixesRef.current = [];
    setEdges([]);
    setJunctions([]);

    const proj = makeProj(position.lat);
    matcherRef.current = new Matcher(graph, proj);
  }

  async function endSession() {
    if (!sessionId || !matcherRef.current) return;

    const session: Session = {
      id: sessionId,
      startedAt: Date.now() - 60000, // Rough estimate
      endedAt: Date.now(),
      edges,
      junctions,
      distance: 0, // Calculate from fixes
    };

    await saveSession(session);

    if (progress) {
      edges.forEach((e) => progress.edges.add(e));
      junctions.forEach((j) => progress.junctions.add(j));
      await saveProgress(progress);
    }

    setIsRecording(false);
    setSessionId(null);
    matcherRef.current = null;
    Alert.alert('Success', `Session saved! Discovered ${edges.length} edges`);
  }

  function toggleSession() {
    if (isRecording) {
      endSession();
    } else {
      startSession();
    }
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: INITIAL_LAT,
          longitude: INITIAL_LON,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Render edges */}
        {graph?.edges.values() &&
          Array.from(graph.edges.values()).map((edge) => (
            <Polyline
              key={edge.id}
              coordinates={edge.coords.map((c) => ({
                latitude: c[0],
                longitude: c[1],
              }))}
              strokeColor={edges.includes(edge.id) ? '#4ade80' : '#64748b'}
              strokeWidth={2}
            />
          ))}

        {/* Current position */}
        {position && (
          <Marker
            coordinate={{ latitude: position.lat, longitude: position.lon }}
            title="You are here"
          />
        )}
      </MapView>

      {/* HUD */}
      <View style={styles.hud}>
        <Text style={styles.score}>{score}</Text>
        <Text style={styles.label}>points</Text>
      </View>

      {/* Controls */}
      <TouchableOpacity
        style={[styles.recordButton, isRecording && styles.recording]}
        onPress={toggleSession}
      >
        <Text style={styles.recordText}>{isRecording ? 'Stop' : 'Start'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// Simple haversine for quick distance calc
function haversineSimple(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  hud: {
    position: 'absolute',
    top: 40,
    left: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
  score: {
    fontSize: 28,
    fontWeight: '700',
    color: '#4ade80',
  },
  label: {
    fontSize: 12,
    color: '#94a3b8',
  },
  recordButton: {
    position: 'absolute',
    bottom: 100,
    left: '50%',
    transform: [{ translateX: -50 }],
    backgroundColor: '#4f46e5',
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  recording: {
    backgroundColor: '#dc2626',
  },
  recordText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
