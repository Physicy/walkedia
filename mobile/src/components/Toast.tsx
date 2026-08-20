// Ce qu'il reste de ponctuel et sans état dédié : zone pas encore chargée,
// activation du suivi en arrière-plan… La complétion d'un carrefour et la fin
// de session sont passées à un état à part entière (voir PointGagneVoile,
// SessionSummary) — une ligne ne peut ni montrer un glyphe ni distinguer ce
// qui a compté de ce qui n'a pas compté.
//
// Juste sous la barre de statut, en petit : les messages qui restent ("zone
// pas encore chargée", cooldown de rechargement) reviennent souvent en
// déplaçant la carte, donc ne doivent pas concurrencer visuellement ce qui
// se passe sur la carte elle-même.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADIUS } from '../theme';

export function Toast({ message }: { message: string | null }) {
  const insets = useSafeAreaInsets();
  if (!message) return null;
  return (
    <View style={[styles.wrap, { top: insets.top + 6 }]} pointerEvents="none">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    zIndex: 1750,
    backgroundColor: 'rgba(251, 250, 253, 0.92)',
    borderWidth: 1,
    borderColor: COLORS.ligne,
    borderRadius: RADIUS.s,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  text: { fontFamily: FONTS.texteMedium, color: COLORS.encre2, fontSize: 11.5, textAlign: 'center' },
});
