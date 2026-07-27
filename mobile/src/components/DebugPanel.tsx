// Panneau visible uniquement en dev : simule un déplacement à pied le long
// du graphe chargé (équivalent de window.__walkedia.feedFix côté PWA), pour
// valider tout le pipeline matching -> progression -> HUD depuis Expo Go
// sans avoir à marcher.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme';

export function DebugPanel({ onSimulate }: { onSimulate: () => void }) {
  if (!__DEV__) return null;
  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.btn} onPress={onSimulate}>
        <Text style={styles.text}>🐞 Simuler un déplacement</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 70, right: 12, zIndex: 1000 },
  btn: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  text: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
});
