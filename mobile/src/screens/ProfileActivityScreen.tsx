// Sorties et quartiers, sortis du profil (voir ProfileScreen.tsx) : la liste
// complète des sorties n'a pas sa place sous le total et le graphique de la
// semaine à chaque visite — elle vit ici, à un appui de distance.

import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../theme';
import { Eyebrow } from '../components/ui';
import { Icone } from '../components/Icones';
import type { Progress } from '../logic/storage';
import type { NeighborhoodStat } from '../hooks/useWalkedia';

// Numérote chaque sortie par les points qu'elle a fait tomber : un simple
// cumul sur les sessions dans l'ordre, puisque la numérotation elle-même suit
// l'ordre de complétion (voir junctionInfo.ts, pointNumber) et que les
// sessions sont conservées triées par date de début.
function nommerSorties(sessions: Progress['sessions']) {
  let cumul = 0;
  return sessions.map((s) => {
    const debut = cumul + 1;
    cumul += s.junctions;
    let label: string;
    if (s.junctions === 0) label = 'Aucun point';
    else if (s.junctions === 1) label = `Point n° ${debut}`;
    else if (s.junctions === 2) label = `Points n° ${debut} et ${cumul}`;
    else label = `Points n° ${debut} à ${cumul}`;
    return { ...s, label };
  });
}

export function ProfileActivityScreen({
  progress,
  neighborhoods,
  onFermer,
}: {
  progress: Progress;
  neighborhoods: NeighborhoodStat[];
  onFermer: () => void;
}) {
  const insets = useSafeAreaInsets();

  const sorties = useMemo(() => {
    const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    // Une sortie sans le moindre carrefour débloqué n'apprend rien sur la
    // progression : seules celles qui en ont au moins un apparaissent ici.
    const liste = nommerSorties(progress.sessions)
      .filter((s) => s.junctions > 0)
      .reverse();
    return { liste, dateFmt };
  }, [progress.sessions]);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.tete}>
        <Pressable style={styles.rond} onPress={onFermer} accessibilityRole="button" accessibilityLabel="Retour">
          <Icone nom="retour" size={18} color={COLORS.encre} strokeWidth={1.9} />
        </Pressable>
        <Text style={styles.titre}>Sorties & quartiers</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 26 }} showsVerticalScrollIndicator={false}>
        <Eyebrow style={styles.sectionTitre}>Dernières sorties</Eyebrow>
        <Text style={styles.aide}>Seules les sorties ayant débloqué au moins un carrefour.</Text>
        {sorties.liste.length === 0 ? (
          <Text style={styles.vide}>Aucune sortie pour l'instant.</Text>
        ) : (
          sorties.liste.map((s, i) => (
            <View key={i} style={styles.sortie}>
              <View style={[styles.puce, styles.puceGain]} />
              <View style={styles.sortieTexte}>
                <Text style={styles.sortieTitre}>{s.label}</Text>
                <Text style={styles.sortieDetail}>
                  {sorties.dateFmt.format(new Date(s.start)).replace('.', '')}
                  {s.km != null ? ` · ${s.km.toFixed(1)} km` : ''}
                  {s.imported ? ' · importée' : ''}
                </Text>
              </View>
              <Text style={styles.sortiePts}>
                +{s.junctions} pt{s.junctions > 1 ? 's' : ''}
              </Text>
            </View>
          ))
        )}

        <Eyebrow style={styles.sectionTitre}>Quartiers</Eyebrow>
        {neighborhoods.length === 0 ? (
          <Text style={styles.vide}>Aucun quartier cartographié dans les zones chargées pour l'instant.</Text>
        ) : (
          neighborhoods.map((n) => (
            <View key={n.id} style={styles.quartier}>
              <Text style={styles.quartierNom} numberOfLines={1}>
                {n.name || 'Quartier sans nom'}
              </Text>
              <Text style={[styles.quartierPct, n.unlocked && styles.quartierDebloque]}>
                {n.unlocked ? 'Débloqué' : `${Math.round(n.pct * 100)} %`}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 1900, backgroundColor: COLORS.papier },
  scroll: { flex: 1 },
  tete: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  rond: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligneForte,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titre: { fontFamily: FONTS.display, fontSize: 21, letterSpacing: -0.42, color: COLORS.encre, flex: 1 },

  sectionTitre: { paddingHorizontal: 20, marginTop: 22, marginBottom: 4 },
  aide: { fontFamily: FONTS.texte, fontSize: 11.5, color: COLORS.encre3, paddingHorizontal: 20, marginBottom: 4 },

  vide: { fontFamily: FONTS.texte, fontSize: 13, color: COLORS.encre2, paddingHorizontal: 20, paddingVertical: 10 },
  sortie: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: COLORS.ligne,
  },
  puce: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: COLORS.ligneForte },
  puceGain: { backgroundColor: COLORS.trace },
  sortieTexte: { flex: 1 },
  sortieTitre: { fontFamily: FONTS.texteSemi, fontSize: 13.5, color: COLORS.encre },
  sortieDetail: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.encre3, marginTop: 2 },
  sortiePts: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.trace },

  quartier: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: COLORS.ligne,
  },
  quartierNom: { fontFamily: FONTS.texte, fontSize: 13, color: COLORS.encre2, flexShrink: 1 },
  quartierPct: { fontFamily: FONTS.monoMedium, fontSize: 12, color: COLORS.encre2 },
  quartierDebloque: { color: COLORS.trace },
});
