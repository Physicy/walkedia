// Voile de fusion, affiché une fois après la connexion quand ce téléphone et
// le compte avaient chacun déjà un relevé (voir syncOnSignIn dans
// useWalkedia.ts). La fusion par union est la partie la plus rassurante du
// backend — une rue marchée d'un côté ou de l'autre reste acquise, rien n'est
// écrasé — et elle était jusqu'ici invisible : un compte qui synchronise en
// silence peut aussi bien être en train d'écraser.
//
// `communes` vient d'un calcul par inclusion-exclusion fait une seule fois,
// à la fusion (voir FusionResume) : local + compte - total.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS, RADIUS } from '../theme';
import { Bouton, Mono } from './ui';
import type { FusionResume } from '../hooks/useWalkedia';

export function FusionVoile({ resume, onFermer }: { resume: FusionResume; onFermer: () => void }) {
  return (
    <View style={styles.voile}>
      <View style={styles.carte}>
        <Text style={styles.titre}>Rien n'a été écrasé.</Text>
        <Text style={styles.texte}>
          Ce téléphone et ton compte avaient chacun leur relevé. Walkedia les a additionnés : une rue marchée d'un
          côté ou de l'autre reste acquise.
        </Text>

        <View style={styles.somme}>
          <View style={styles.sommeCase}>
            <Mono style={styles.sommeValeur}>{resume.local}</Mono>
            <Text style={styles.sommeLabel}>cet appareil</Text>
          </View>
          <Text style={styles.sommeOp}>+</Text>
          <View style={styles.sommeCase}>
            <Mono style={styles.sommeValeur}>{resume.compte}</Mono>
            <Text style={styles.sommeLabel}>ton compte</Text>
          </View>
          <Text style={styles.sommeOp}>=</Text>
          <View style={styles.sommeCase}>
            <Mono style={[styles.sommeValeur, styles.sommeValeurTotal]}>{resume.total}</Mono>
            <Text style={styles.sommeLabel}>rues</Text>
          </View>
        </View>

        {resume.communes > 0 && (
          <Mono style={styles.note}>
            {resume.communes} rue{resume.communes > 1 ? 's étaient communes' : ' était commune'} aux deux.
          </Mono>
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
    zIndex: 2100,
    backgroundColor: COLORS.papier,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  carte: { width: '100%', maxWidth: 360, alignItems: 'center' },
  titre: {
    fontFamily: FONTS.display,
    fontSize: 26,
    letterSpacing: -0.52,
    color: COLORS.encre,
    textAlign: 'center',
  },
  texte: {
    fontFamily: FONTS.texte,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.encre2,
    textAlign: 'center',
    marginTop: 12,
  },
  somme: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 30 },
  sommeCase: { alignItems: 'center', gap: 3 },
  sommeValeur: { fontSize: 22, fontFamily: FONTS.monoSemi, color: COLORS.encre },
  sommeValeurTotal: { color: COLORS.trace },
  sommeLabel: { fontFamily: FONTS.texte, fontSize: 11, color: COLORS.encre2 },
  sommeOp: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.encre3 },
  note: { fontSize: 11, color: COLORS.encre3, marginTop: 18, letterSpacing: 0.3 },
  bouton: { width: '100%', marginTop: 30 },
});
