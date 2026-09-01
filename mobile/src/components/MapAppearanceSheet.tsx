// Apparence de la carte (Réglages > Apparence de la carte) : calque affiché
// et fond de carte. Les deux sont maintenant LUS par MapScreen.tsx (calque =
// ce que la géométrie raconte, fond = ce qu'il y a dessous) ; ils ne faisaient
// avant qu'un aller-retour vers AsyncStorage, d'où une feuille de réglage qui
// enregistrait un choix sans que la carte change quoi que ce soit.
//
// La feuille est passée « contrôlée » au passage : elle ne relit plus les
// préférences pour son propre compte, elle affiche l'état du hook de jeu et
// remonte les choix (voir useWalkedia.ts, setMapLayer/setMapBackground). Une
// copie locale rechargée à l'ouverture aurait pu diverger de ce que la carte
// dessine réellement.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, RADIUS, TRACE_PALETTE } from '../theme';
import { Icone } from './Icones';
import { Eyebrow, Titre } from './ui';
import type { Prefs } from '../logic/prefs';

export const MAP_LAYERS: { id: Prefs['mapLayer']; nameKey: string; descKey: string }[] = [
  { id: 'trace', nameKey: 'settings.mapLayerTraceName', descKey: 'settings.mapLayerTraceDesc' },
  { id: 'chaleur', nameKey: 'settings.mapLayerHeatName', descKey: 'settings.mapLayerHeatDesc' },
  { id: 'quartiers', nameKey: 'settings.mapLayerNeighborhoodsName', descKey: 'settings.mapLayerNeighborhoodsDesc' },
];

const BACKGROUNDS: { id: Prefs['mapBackground']; nameKey: string }[] = [
  { id: 'clair', nameKey: 'settings.mapBackgroundLight' },
  { id: 'plan', nameKey: 'settings.mapBackgroundPlan' },
];

export function MapAppearanceSheet({
  mapLayer,
  onChoisirCalque,
  mapBackground,
  onChoisirFond,
  traceColor,
  onChoisirCouleur,
  onFermer,
}: {
  mapLayer: Prefs['mapLayer'];
  onChoisirCalque: (id: Prefs['mapLayer']) => void;
  mapBackground: Prefs['mapBackground'];
  onChoisirFond: (id: Prefs['mapBackground']) => void;
  traceColor: string;
  onChoisirCouleur: (hex: string) => void;
  onFermer: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Pressable style={styles.voile} onPress={onFermer}>
      <Pressable style={[styles.feuille, { paddingBottom: insets.bottom + 22 }]} onPress={(e) => e.stopPropagation()}>
        <View style={styles.poignee} />
        <Titre style={styles.titre}>{t('settings.mapAppearanceTitle')}</Titre>

        <Eyebrow style={styles.section}>{t('settings.mapLayerSectionTitle')}</Eyebrow>
        {MAP_LAYERS.map((l) => {
          const actif = mapLayer === l.id;
          return (
            <Pressable key={l.id} onPress={() => onChoisirCalque(l.id)} style={[styles.calqueLigne, actif && styles.calqueLigneActive]}>
              <View style={styles.calqueTexte}>
                <Text style={styles.calqueNom}>{t(l.nameKey)}</Text>
                <Text style={styles.calqueDesc}>{t(l.descKey)}</Text>
              </View>
              <View style={[styles.radio, actif && styles.radioActif]} />
            </Pressable>
          );
        })}

        <Eyebrow style={styles.section}>{t('settings.mapBackgroundSectionTitle')}</Eyebrow>
        <View style={styles.fondsRangee}>
          {BACKGROUNDS.map((f) => {
            const actif = mapBackground === f.id;
            return (
              <Pressable key={f.id} onPress={() => onChoisirFond(f.id)} style={[styles.fondChip, actif && styles.fondChipActive]}>
                <Text style={[styles.fondChipTexte, actif && styles.fondChipTexteActive]}>{t(f.nameKey)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Eyebrow style={styles.section}>{t('profile.yourColor')}</Eyebrow>
        <View style={styles.couleurs}>
          {TRACE_PALETTE.map((hex) => {
            const choisie = hex.toLowerCase() === traceColor.toLowerCase();
            return (
              <Pressable
                key={hex}
                onPress={() => onChoisirCouleur(hex)}
                style={[styles.pastilleCouleur, { backgroundColor: hex }, choisie && styles.pastilleCouleurChoisie]}
                accessibilityRole="button"
                accessibilityLabel={t('profile.chooseColor', { hex })}
                accessibilityState={{ selected: choisie }}
              >
                {choisie && <Icone nom="coche" size={16} color="#fff" strokeWidth={2.6} />}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  voile: { ...StyleSheet.absoluteFillObject, zIndex: 2000, backgroundColor: 'rgba(26, 27, 46, 0.35)', justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.l,
    borderTopRightRadius: RADIUS.l,
    padding: 22,
    maxHeight: '85%',
  },
  poignee: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.ligneForte, alignSelf: 'center', marginBottom: 16 },
  titre: { fontSize: 21, textAlign: 'center', marginBottom: 4 },
  section: { marginTop: 22, marginBottom: 10 },

  calqueLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    padding: 13,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: COLORS.papier,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  calqueLigneActive: { backgroundColor: 'rgba(108,93,244,0.1)', borderColor: COLORS.trace },
  calqueTexte: { flex: 1, minWidth: 0 },
  calqueNom: { fontFamily: FONTS.texteSemi, fontSize: 14, color: COLORS.encre },
  calqueDesc: { fontFamily: FONTS.texte, fontSize: 12, color: COLORS.encre2, marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.ligneForte },
  radioActif: { borderColor: COLORS.trace, backgroundColor: COLORS.trace },

  fondsRangee: { flexDirection: 'row', gap: 8 },
  fondChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 11, backgroundColor: COLORS.papier, borderWidth: 1, borderColor: 'transparent' },
  fondChipActive: { backgroundColor: COLORS.encre },
  fondChipTexte: { fontFamily: FONTS.texteSemi, fontSize: 12.5, color: COLORS.encre2 },
  fondChipTexteActive: { color: COLORS.surface },

  couleurs: { flexDirection: 'row', gap: 12 },
  pastilleCouleur: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  pastilleCouleurChoisie: { borderColor: COLORS.encre },
});
