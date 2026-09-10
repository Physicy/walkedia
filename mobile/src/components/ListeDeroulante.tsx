// Liste déroulante compacte : un déclencheur bordé qui ouvre ses options
// juste en dessous, par-dessus le contenu.
//
// Ni `Modal`, ni le sélecteur natif : le menu doit rester DANS la carte qui
// le porte, comme une liste déroulante de formulaire, et un composant natif
// n'aurait ni la bordure, ni la typographie, ni la ligne sombre de l'option
// choisie. C'est aussi la raison pour laquelle il n'y a pas de voile
// plein écran : le menu vit à l'intérieur de sa carte.
//
// L'écran porte l'état d'ouverture, comme pour LanguagePicker : c'est lui qui
// sait quand le refermer sans qu'on ait touché une option (un défilement, une
// autre feuille qui s'ouvre).

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../theme';
import { Icone } from './Icones';

export interface OptionDeroulante {
  id: string;
  label: string;
}

export function ListeDeroulante({
  valeur,
  options,
  ouvert,
  onBascule,
  onChoisir,
  accessibilityLabel,
}: {
  valeur: string;
  options: OptionDeroulante[];
  ouvert: boolean;
  onBascule: (ouvrir: boolean) => void;
  onChoisir: (id: string) => void;
  accessibilityLabel?: string;
}) {
  const courante = options.find((o) => o.id === valeur);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onBascule(!ouvert)}
        style={[styles.declencheur, ouvert && styles.declencheurOuvert]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: courante?.label }}
        accessibilityState={{ expanded: ouvert }}
      >
        <Text style={styles.declencheurTexte} numberOfLines={1}>
          {courante?.label ?? ''}
        </Text>
        <Icone nom={ouvert ? 'chevronHaut' : 'chevronBas'} size={14} color={COLORS.encre2} strokeWidth={2} />
      </Pressable>

      {ouvert && (
        <View style={styles.menu}>
          {options.map((o) => {
            const actif = o.id === valeur;
            return (
              <Pressable
                key={o.id}
                onPress={() => {
                  onChoisir(o.id);
                  onBascule(false);
                }}
                style={[styles.option, actif && styles.optionActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
              >
                <Text style={[styles.optionTexte, actif && styles.optionTexteActif]} numberOfLines={1}>
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // `zIndex` sur le conteneur, pas seulement sur le menu : en React Native,
  // un enfant ne peut pas passer par-dessus un FRÈRE de son parent tant que
  // ce parent ne remonte pas lui-même dans l'ordre de rendu.
  wrap: { position: 'relative', zIndex: 30 },

  declencheur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.ligne,
    backgroundColor: COLORS.surface,
  },
  declencheurOuvert: { borderColor: COLORS.ligneForte },
  declencheurTexte: { fontFamily: FONTS.texte, fontSize: 12.5, color: COLORS.encre },

  menu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    minWidth: 148,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.ligne,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    zIndex: 30,
    elevation: 8,
    shadowColor: '#1A1B2E',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  option: { paddingVertical: 9, paddingHorizontal: 12 },
  optionActive: { backgroundColor: COLORS.encre },
  optionTexte: { fontFamily: FONTS.texte, fontSize: 12.5, color: COLORS.encre2 },
  optionTexteActif: { color: COLORS.surface },
});
