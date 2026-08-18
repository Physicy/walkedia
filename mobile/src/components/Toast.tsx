// Ce qu'il reste de ponctuel et sans état dédié : zone pas encore chargée,
// activation du suivi en arrière-plan… La complétion d'un carrefour et la fin
// de session sont passées à un état à part entière (voir PointGagneVoile,
// SessionSummary) — une ligne ne peut ni montrer un glyphe ni distinguer ce
// qui a compté de ce qui n'a pas compté.
//
// Positionné sous la barre du haut plutôt qu'au-dessus du panneau du bas : ce
// dernier change de hauteur entre ses deux états (prêt/session) et une
// position fixe finirait par chevaucher son contenu.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADIUS } from '../theme';

export function Toast({ message }: { message: string | null }) {
  const insets = useSafeAreaInsets();
  if (!message) return null;
  return (
    <View style={[styles.wrap, { top: insets.top + 76 }]} pointerEvents="none">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: '7%',
    right: '7%',
    zIndex: 1750,
    backgroundColor: COLORS.encre,
    borderRadius: RADIUS.m,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  text: { fontFamily: FONTS.texteMedium, color: COLORS.surface, fontSize: 14, textAlign: 'center' },
});
