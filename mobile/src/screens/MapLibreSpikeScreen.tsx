// Phase 0 du chantier "backend + MapLibre" (voir plan) : écran minimal pour
// valider que @maplibre/maplibre-react-native build et s'affiche
// correctement sur ce projet (Expo 54 / RN 0.81, Nouvelle Architecture)
// avant d'investir dans le reste de la migration. Volontairement séparé de
// MapScreen.tsx — accessible via un bouton debug (__DEV__ uniquement, voir
// App.tsx), ne touche à aucun code de gameplay.
//
// Tuiles raster OSM identiques à celles utilisées aujourd'hui via
// react-native-maps' <UrlTile> (mobile/src/screens/MapScreen.tsx) : pas de
// fournisseur de tuiles vectorielles payant, même politique d'usage OSM.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Map, Camera, RasterSource, Layer, Marker } from '@maplibre/maplibre-react-native';
import { COLORS } from '../theme';

// MapLibre attend [longitude, latitude], à l'inverse de react-native-maps
// (latitude, longitude) — piège classique lors du portage.
const CENTER: [number, number] = [2.3522, 48.8566]; // Paris, pas de position réelle nécessaire pour ce spike

export function MapLibreSpikeScreen({ onClose }: { onClose: () => void }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Map mapStyle={{ version: 8, sources: {}, layers: [] }} style={StyleSheet.absoluteFill}>
        <Camera initialViewState={{ center: CENTER, zoom: 15 }} />
        <RasterSource id="osm-raster" tiles={['https://tile.openstreetmap.org/{z}/{x}/{y}.png']} tileSize={256} minzoom={0} maxzoom={19}>
          <Layer type="raster" id="osm-raster-layer" />
        </RasterSource>
        <Marker id="spike-marker" lngLat={CENTER}>
          <View style={styles.marker} />
        </Marker>
      </Map>

      <View style={styles.banner} pointerEvents="box-none">
        <Text style={styles.bannerText}>Spike MapLibre (Phase 0) — tuiles OSM raster, aucune donnée de jeu</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Fermer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.position,
    borderWidth: 2,
    borderColor: '#fff',
  },
  banner: {
    position: 'absolute',
    top: 50,
    left: 12,
    right: 12,
    zIndex: 1000,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 10,
  },
  bannerText: { color: COLORS.text, fontSize: 13 },
  closeBtn: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  closeBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
