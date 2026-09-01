// Sélecteur de langue : une ligne de navigation dans Réglages qui ouvre une
// feuille avec recherche, plutôt que la boîte + Modal générique d'avant —
// migré au passage du thème bleu nuit vers encre/papier (voir theme.ts),
// resté en retard lors de la dernière refonte.
//
// La ligne et la feuille sont deux composants SÉPARÉS, et c'est l'écran
// Réglages qui porte l'état d'ouverture (voir SettingsScreen.tsx). Le
// composant unique d'avant rendait sa feuille là où la ligne était posée,
// c'est-à-dire à l'intérieur du ScrollView de l'écran : la FlatList des 31
// langues se retrouvait alors imbriquée dans un ScrollView de même
// orientation, d'où l'avertissement « VirtualizedLists should never be nested
// inside plain ScrollViews » à chaque ouverture — et, au-delà de
// l'avertissement, un recyclage de lignes cassé (la liste ne connaît plus sa
// fenêtre visible). La feuille est maintenant montée à côté du ScrollView,
// comme MapAppearanceSheet.

import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, RADIUS } from '../theme';
import { Icone } from './Icones';
import { Titre } from './ui';
import { SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from '../i18n';

export function LanguageRow({ onPress }: { onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language);
  return (
    <Pressable
      onPress={onPress}
      style={styles.ligne}
      accessibilityRole="button"
      accessibilityLabel={t('profile.chooseLanguage')}
    >
      <Text style={styles.ligneNom}>{current?.name ?? i18n.language}</Text>
      <Text style={styles.ligneCompte}>{t('settings.languageCount', { count: SUPPORTED_LANGUAGES.length })}</Text>
      <Icone nom="chevronDroit" size={16} color={COLORS.encre3} strokeWidth={1.9} />
    </Pressable>
  );
}

export function LanguageSheet({ onFermer }: { onFermer: () => void }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();

  const filtered = useMemo(
    () => SUPPORTED_LANGUAGES.filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase())),
    [query]
  );

  const choose = async (code: LanguageCode) => {
    onFermer();
    const { rtlChanged } = await setLanguage(code);
    if (rtlChanged) {
      // eslint-disable-next-line no-alert
      Alert.alert(t('profile.language'), t('profile.restartForRtl'));
    }
  };

  return (
    <Pressable style={styles.voile} onPress={onFermer}>
      <Pressable style={styles.feuille} onPress={(e) => e.stopPropagation()}>
        <View style={styles.poignee} />
        <Titre style={styles.titre}>{t('profile.chooseLanguage')}</Titre>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('settings.searchLanguagePlaceholder')}
          placeholderTextColor={COLORS.encre3}
          style={styles.recherche}
          autoCorrect={false}
        />
        <FlatList
          data={filtered}
          keyExtractor={(l) => l.code}
          style={styles.liste}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const actif = item.code === i18n.language;
            return (
              <Pressable style={styles.rangee} onPress={() => choose(item.code)}>
                <Text style={[styles.rangeeTexte, actif && styles.rangeeTexteActif]}>{item.name}</Text>
                {actif && <Icone nom="coche" size={15} color={COLORS.trace} strokeWidth={2.4} />}
              </Pressable>
            );
          }}
        />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.ligne,
  },
  ligneNom: { flex: 1, fontFamily: FONTS.texteSemi, fontSize: 14, color: COLORS.encre },
  ligneCompte: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.encre3 },

  voile: { ...StyleSheet.absoluteFillObject, zIndex: 2000, backgroundColor: 'rgba(26, 27, 46, 0.35)', justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.l,
    borderTopRightRadius: RADIUS.l,
    padding: 22,
    paddingBottom: 16,
    maxHeight: '80%',
  },
  poignee: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.ligneForte, alignSelf: 'center', marginBottom: 16 },
  titre: { fontSize: 21, textAlign: 'center', marginBottom: 14 },
  recherche: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.ligne,
    backgroundColor: COLORS.papier,
    paddingVertical: 13,
    paddingHorizontal: 15,
    fontFamily: FONTS.texte,
    fontSize: 14,
    color: COLORS.encre,
  },
  liste: { marginTop: 6, flexGrow: 0 },
  rangee: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.ligne,
  },
  rangeeTexte: { fontFamily: FONTS.texte, fontSize: 14, color: COLORS.encre },
  rangeeTexteActif: { fontFamily: FONTS.texteSemi, color: COLORS.trace },
});
