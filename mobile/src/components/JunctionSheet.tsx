// Fiche de carrefour, ouverte en touchant un point sur la carte.
//
// Le dessin porte toute l'information (branche marchée ou non, sens et
// nombre) : pas besoin de la répéter en texte à côté, une liste "Rue 1, Rue 2…"
// ne dit rien que le glyphe ne montre déjà.
//
// La règle citée est vérifiée dans le code serveur qui construit les
// carrefours (supabase/functions/_shared/graph.ts) et pas devinée : une
// impasse de moins de 30 m (STUB_MAX) ne compte pas comme branche, et en zone
// urbaine dense seules les rues carrossables comptent.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS, RADIUS } from '../theme';
import { Eyebrow, Titre } from './ui';
import { Carrefour, Branche } from './Carrefour';

export function JunctionSheet({
  numero,
  branches,
  onFermer,
  couleur,
}: {
  numero: number | null;
  branches: Branche[];
  onFermer: () => void;
  couleur: string;
}) {
  const complet = branches.length > 0 && branches.every((b) => b[1]);

  return (
    <Pressable style={styles.voile} onPress={onFermer}>
      <Pressable style={styles.feuille} onPress={(e) => e.stopPropagation()}>
        <View style={styles.poignee} />
        <View style={styles.entete}>
          <Carrefour size={84} branches={branches} couleur={couleur} />
          <Eyebrow style={styles.eyebrow}>{complet ? 'Carrefour complété' : 'Carrefour incomplet'}</Eyebrow>
          <Titre style={styles.titre}>{numero != null ? `Point n° ${numero}` : `${branches.length} branches`}</Titre>
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

  entete: { alignItems: 'center' },
  eyebrow: { marginTop: 16 },
  titre: { fontSize: 21, marginTop: 4 },

  regle: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    lineHeight: 15,
    color: COLORS.encre3,
    textAlign: 'center',
    marginTop: 22,
  },
});
