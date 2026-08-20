// Voile plein écran affiché à la complétion d'un carrefour.
//
// N'existait pas avant : compléter un carrefour produisait un toast d'une
// ligne, qui ne peut ni montrer le glyphe ni distinguer les rues inédites de
// celles déjà connues.

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

  const phrase =
    nouvelles > 0
      ? `${total} rue${total > 1 ? 's' : ''} sur ${total}, dont ${nouvelles} que tu n'avais jamais prise${nouvelles > 1 ? 's' : ''}.`
      : `${total} rue${total > 1 ? 's' : ''} sur ${total}, toutes déjà connues.`;

  return (
    <Animated.View style={[styles.voile, { opacity: apparition }]}>
      <Carrefour size={112} branches={branches} couleur={couleur} />
      <Text style={styles.eyebrow}>Carrefour complété</Text>
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
