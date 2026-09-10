// Voile plein écran affiché quand un point d'intersection est atteint pour la
// première fois (règle C2 : passer à moins de 5 m suffit).
//
// N'existait pas avant : gagner un point produisait un toast d'une ligne, qui
// ne peut ni montrer le glyphe ni dire où en est l'exploration des tronçons
// qui partent de ce point.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../theme';
import { Bouton, Mono } from './ui';
import { Carrefour, Branche } from './Carrefour';

export function PointGagneVoile({
  numero,
  nouvelles,
  total,
  branches,
  totalPoints,
  totalTroncons,
  kmReleves,
  onContinuer,
  couleur,
}: {
  numero: number;
  nouvelles: number;
  total: number;
  branches: Branche[];
  totalPoints: number;
  totalTroncons: number;
  kmReleves: number;
  onContinuer: () => void;
  couleur: string;
}) {
  const apparition = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(apparition, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [apparition]);

  // `nouvelles` : tronçons de ce point déjà relevés, sur son nombre total de
  // branches. Un point s'obtient en y passant ; ses rues, elles, se relèvent
  // une par une en les marchant d'un point au suivant.
  const restantes = Math.max(0, total - nouvelles);
  const phrase =
    restantes === 0
      ? `${total} rue${total > 1 ? 's' : ''} sur ${total}, tu les as toutes relevées.`
      : `${nouvelles} rue${nouvelles > 1 ? 's' : ''} relevée${nouvelles > 1 ? 's' : ''} sur ${total} — il t'en reste ${restantes} à prendre.`;

  return (
    <Animated.View style={[styles.voile, { opacity: apparition }]}>
      <Carrefour size={112} branches={branches} couleur={couleur} />
      <Text style={styles.eyebrow}>Point atteint</Text>
      <Text style={styles.titre}>Point n° {numero}</Text>
      <Text style={styles.texte}>{phrase}</Text>

      <Bouton onPress={onContinuer} style={styles.bouton}>
        Continuer
      </Bouton>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Mono style={styles.statValeur}>{totalPoints}</Mono>
          <Text style={styles.statLabel}>points</Text>
        </View>
        <View style={styles.stat}>
          <Mono style={styles.statValeur}>{totalTroncons}</Mono>
          <Text style={styles.statLabel}>tronçons</Text>
        </View>
        <View style={styles.stat}>
          <Mono style={styles.statValeur}>{kmReleves.toFixed(1)} km</Mono>
          <Text style={styles.statLabel}>relevés</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  voile: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    backgroundColor: COLORS.papier,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  eyebrow: {
    fontFamily: FONTS.monoMedium,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: COLORS.encre3,
    marginTop: 26,
  },
  titre: { fontFamily: FONTS.display, fontSize: 30, letterSpacing: -0.6, color: COLORS.encre, marginTop: 6 },
  texte: { fontFamily: FONTS.texte, fontSize: 14, lineHeight: 20, color: COLORS.encre2, textAlign: 'center', maxWidth: 280, marginTop: 10 },
  bouton: { width: '100%', maxWidth: 300, marginTop: 26 },
  stats: { flexDirection: 'row', gap: 30, marginTop: 30 },
  stat: { alignItems: 'center', gap: 3 },
  statValeur: { fontSize: 19, fontFamily: FONTS.monoSemi, color: COLORS.encre },
  statLabel: { fontFamily: FONTS.texte, fontSize: 11, color: COLORS.encre2 },
});
