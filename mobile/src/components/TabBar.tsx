// Barre d'onglets : une plaque de rue en encre, la seule surface sombre de
// l'app avec le voile de point gagné. Elle ancre le bas de l'écran pendant que
// la carte, elle, est claire.
//
// « Recherche » devient « Classement » : c'est ce qu'on y trouve, et l'ancien
// nom promettait une recherche qui n'existait pas à cet endroit.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS } from '../theme';
import { Icone, NomIcone } from './Icones';

export type TabName = 'adventure' | 'search' | 'profile';

const TABS: { name: TabName; icone: NomIcone; labelKey: string }[] = [
  { name: 'adventure', icone: 'carte', labelKey: 'tabbar.adventure' },
  { name: 'search', icone: 'classement', labelKey: 'tabbar.search' },
  { name: 'profile', icone: 'profil', labelKey: 'tabbar.profile' },
];

// Hauteur réelle de la barre, pour que les écrans qui posent quelque chose
// juste au-dessus (le socle de MapScreen, notamment) ne se fassent pas manger
// par elle. `76` supposait un bas d'écran sans encoche (paddingBottom replié
// sur le plancher de 10) ; sur un iPhone à indicateur d'accueil,
// insets.bottom (~34) dépasse ce plancher et la barre est donc plus haute que
// prévu — d'où le calcul explicite plutôt qu'une constante figée.
const PADDING_TOP = 11;
const CONTENU = 55; // icône + libellé + pastille + marges verticales du bouton
const PADDING_BOTTOM_PLANCHER = 10;

export function tabBarHeight(insetsBottom: number): number {
  return PADDING_TOP + CONTENU + Math.max(insetsBottom, PADDING_BOTTOM_PLANCHER);
}

export function TabBar({ active, onChange }: { active: TabName; onChange: (t: TabName) => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, PADDING_BOTTOM_PLANCHER) }]}>
      {TABS.map((tab) => {
        const actif = active === tab.name;
        const label = t(tab.labelKey);
        return (
          <Pressable
            key={tab.name}
            style={styles.btn}
            onPress={() => onChange(tab.name)}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={label}
          >
            <Icone nom={tab.icone} size={21} color={actif ? COLORS.surface : 'rgba(232, 231, 238, 0.52)'} />
            <Text style={[styles.label, actif && styles.labelActif]}>{label}</Text>
            {/* le point violet : un point gagné, donc le seul emploi permis de l'accent ici */}
            <View style={[styles.pastille, actif && styles.pastilleActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1700,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.encre,
    paddingTop: PADDING_TOP,
    paddingHorizontal: 8,
  },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 5, minHeight: 44 },
  label: {
    fontFamily: FONTS.monoMedium,
    fontSize: 9,
    letterSpacing: 0.81,
    textTransform: 'uppercase',
    color: 'rgba(232, 231, 238, 0.52)',
  },
  labelActif: { color: COLORS.surface },
  pastille: { width: 4, height: 4, borderRadius: 2, marginTop: 1, backgroundColor: 'transparent' },
  pastilleActive: { backgroundColor: COLORS.trace },
});
