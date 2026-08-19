// Fiche de carrefour, ouverte en touchant un point sur la carte.
//
// Les règles citées ici sont vérifiées dans le code serveur qui construit les
// carrefours (supabase/functions/_shared/graph.ts) et pas devinées : une
// impasse de moins de 30 m (STUB_MAX) ne compte pas comme branche, et en zone
// urbaine dense seules les rues carrossables comptent — un chemin piéton n'y
// ajoute ni ne retire de branche requise.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS, RADIUS } from '../theme';
import { Eyebrow, Titre } from './ui';
import { Icone } from './Icones';
import { Carrefour, Branche } from './Carrefour';

export function JunctionSheet({
  numero,
  branches,
  orientationsManquantes,
  onFermer,
}: {
  numero: number | null;
  branches: Branche[];
  orientationsManquantes: string[];
  onFermer: () => void;
}) {
  const complet = branches.length > 0 && branches.every((b) => b[1]);

  return (
    <Pressable style={styles.voile} onPress={onFermer}>
      <Pressable style={styles.feuille} onPress={(e) => e.stopPropagation()}>
        <View style={styles.poignee} />
        <View style={styles.entete}>
          <Carrefour size={52} branches={branches} />
          <View style={styles.enteteTexte}>
            <Eyebrow>{complet ? 'Carrefour complété' : 'Carrefour incomplet'}</Eyebrow>
            <Titre style={styles.titre}>{numero != null ? `Point n° ${numero}` : `${branches.length} branches`}</Titre>
          </View>
        </View>

        {!complet && (
          <Text style={styles.manque}>
            {orientationsManquantes.length > 0
              ? `Il manque ${orientationsManquantes.length > 1 ? 'les rues' : 'la rue'} ${orientationsManquantes.join(' et ')}.`
              : 'Il manque au moins une rue.'}
          </Text>
        )}

        <View style={styles.liste}>
          {branches.map(([angle, faite], i) => (
            <View key={i} style={styles.ligne}>
              <Icone nom={faite ? 'coche' : 'fermer'} size={14} color={faite ? COLORS.trace : COLORS.encre3} strokeWidth={2.2} />
              <Text style={[styles.ligneTexte, faite && styles.ligneTexteFaite]}>Rue {i + 1}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.regle}>
          Les impasses de moins de 30 m ne comptent pas. En zone dense, seules les rues carrossables comptent.
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  voile: { ...StyleSheet.absoluteFillObject, zIndex: 1800, backgroundColor: 'rgba(26, 27, 46, 0.35)', justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.l,
    borderTopRightRadius: RADIUS.l,
    padding: 22,
    paddingBottom: 34,
  },
  poignee: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.ligneForte, alignSelf: 'center', marginBottom: 16 },

  entete: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  enteteTexte: { flex: 1 },
  titre: { fontSize: 21, marginTop: 4 },

  manque: { fontFamily: FONTS.texte, fontSize: 13.5, color: COLORS.encre2, marginTop: 14 },

  liste: { marginTop: 16, gap: 10 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ligneTexte: { fontFamily: FONTS.texteMedium, fontSize: 13.5, color: COLORS.encre3 },
  ligneTexteFaite: { color: COLORS.encre },

  regle: { fontFamily: FONTS.mono, fontSize: 10, lineHeight: 15, color: COLORS.encre3, marginTop: 20 },
});
