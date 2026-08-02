// Panneau visible uniquement en dev : simule un déplacement à pied le long
// du graphe chargé (équivalent de window.__walkedia.feedFix côté PWA), pour
// valider tout le pipeline matching -> progression -> HUD depuis Expo Go
// sans avoir à marcher.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';

// Petit bouton rond discret (icône seule) pour ne pas surcharger la carte ;
// un appui long affiche le libellé complet le temps du toast déclenché par
// simulateWalk() lui-même (pas besoin de le dupliquer ici).
export function DebugPanel({ onSimulate }: { onSimulate: () => void }) {
  const insets = useSafeAreaInsets();
  if (!__DEV__) return null;
  return (
    <TouchableOpacity
      style={[styles.btn, { top: insets.top + 78 }]}
      onPress={onSimulate}
      accessibilityLabel="Simuler un déplacement (debug)"
    >
      <Text style={styles.icon}>🐞</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
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
  icon: { fontSize: 16 },
});
