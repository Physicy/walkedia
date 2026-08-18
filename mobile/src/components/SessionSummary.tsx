// Résumé de sortie : le moment qui referme la boucle de marche.
//
// N'existait pas avant : terminer une marche produisait un toast d'une ligne.
// Celui-ci dit ce qui a été gagné, et pourquoi le nombre de tronçons crédités
// ne correspond pas forcément à la distance parcourue — sans quoi l'écart
// entre les deux resterait inexplicable (une rue déjà connue, un aller-retour,
// une impasse de moins de 30 m, ne rapportent rien de nouveau).
//
// Sert aussi d'écran d'arrêt automatique : si `raisonVitesse` est renseigné,
// la sortie a été coupée parce que le joueur roulait, pas parce qu'il l'a
// demandé — la vitesse mesurée est donc affichée pour que ça ne semble pas
// arbitraire.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS, RADIUS } from '../theme';
import { Bouton, Mono } from './ui';
import type { SortieResume } from '../hooks/useWalkedia';

export function SessionSummary({ resume, onFermer }: { resume: SortieResume; onFermer: () => void }) {
  return (
    <View style={styles.voile}>
      <View style={styles.carte}>
        {resume.raisonVitesse != null && (
          <View style={styles.alerte}>
            <Text style={styles.alerteTexte}>Tu roulais à {resume.raisonVitesse} km/h : la session s'est arrêtée toute seule.</Text>
          </View>
        )}

        <Text style={styles.eyebrow}>Sortie terminée</Text>
        <Text style={styles.titre}>{resume.minutes} min de marche</Text>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Mono style={styles.statValeur}>{resume.junctions}</Mono>
            <Text style={styles.statLabel}>{resume.junctions > 1 ? 'points' : 'point'}</Text>
          </View>
          <View style={styles.stat}>
            <Mono style={styles.statValeur}>{resume.edges}</Mono>
            <Text style={styles.statLabel}>tronçons</Text>
          </View>
          <View style={styles.stat}>
            <Mono style={styles.statValeur}>{resume.km.toFixed(1)} km</Mono>
            <Text style={styles.statLabel}>parcourus</Text>
          </View>
        </View>

        {resume.edges === 0 && resume.km > 0.05 ? (
          <Text style={styles.note}>
            Rien de nouveau cette fois : ce trajet passait par des rues déjà relevées. Elles comptent quand même dans
            tes km parcourus.
          </Text>
        ) : (
          <Text style={styles.note}>
            Ne comptent que les rues jamais marchées avant, et les impasses de moins de 30 m ne comptent pas : c'est
            pour ça que les tronçons crédités sont souvent moins nombreux que les rues prises.
          </Text>
        )}

        <Bouton onPress={onFermer} style={styles.bouton}>
          Voir ma carte
        </Bouton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  voile: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    backgroundColor: 'rgba(26, 27, 46, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  carte: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.l,
    padding: 26,
    alignItems: 'center',
  },
  alerte: {
    width: '100%',
    backgroundColor: COLORS.tracePale,
    borderRadius: RADIUS.m,
    padding: 12,
    marginBottom: 18,
  },
  alerteTexte: { fontFamily: FONTS.texteMedium, fontSize: 12.5, color: COLORS.encre2, lineHeight: 18 },

  eyebrow: {
    fontFamily: FONTS.monoMedium,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: COLORS.encre3,
  },
  titre: { fontFamily: FONTS.display, fontSize: 26, letterSpacing: -0.52, color: COLORS.encre, marginTop: 6 },

  stats: { flexDirection: 'row', gap: 28, marginTop: 22 },
  stat: { alignItems: 'center', gap: 3 },
  statValeur: { fontSize: 20, fontFamily: FONTS.monoSemi, color: COLORS.trace },
  statLabel: { fontFamily: FONTS.texte, fontSize: 11, color: COLORS.encre2 },

  note: { fontFamily: FONTS.texte, fontSize: 12.5, lineHeight: 18, color: COLORS.encre2, textAlign: 'center', marginTop: 20 },
  bouton: { width: '100%', marginTop: 22 },
});
