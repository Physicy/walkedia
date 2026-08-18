// Éléments partagés du système encre et papier.
//
// Les interlettrages du design sont exprimés en `em` ; React Native ne connaît
// que des points, donc chaque valeur est convertie à la taille de son style
// (0.14em sur 9.5px vaut 1.33pt).

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { COLORS, FONTS, RADIUS } from '../theme';

export function Titre({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.titre, style]}>{children}</Text>;
}

export function Eyebrow({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

export function Mono({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.mono, style]}>{children}</Text>;
}

export function Corps({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.corps, style]}>{children}</Text>;
}

export function Carte({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.carte, style]}>{children}</View>;
}

export function Bouton({
  children,
  onPress,
  variante = 'plein',
  disabled,
  busy,
  icone,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variante?: 'plein' | 'fantome' | 'sortie';
  disabled?: boolean;
  busy?: boolean;
  icone?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const inerte = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={inerte}
      style={({ pressed }) => [
        styles.btn,
        variante === 'fantome' && styles.btnFantome,
        variante === 'sortie' && styles.btnSortie,
        pressed && styles.btnPresse,
        inerte && styles.btnInerte,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variante === 'plein' ? COLORS.surface : COLORS.encre} />
      ) : (
        <>
          {icone}
          <Text
            style={[
              styles.btnTexte,
              variante === 'fantome' && styles.btnTexteFantome,
              variante === 'sortie' && styles.btnTexteSortie,
            ]}
          >
            {children}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// Jauge fine du relevé : une seule ligne, là où l'ancien HUD empilait deux
// fractions dont le dénominateur bougeait avec les déplacements.
export function Jauge({ ratio }: { ratio: number }) {
  const p = Math.max(0.005, Math.min(1, ratio));
  return (
    <View style={styles.jauge}>
      <View style={[styles.jaugeFill, { width: `${p * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  titre: {
    fontFamily: FONTS.display,
    fontSize: 27,
    lineHeight: 27,
    letterSpacing: -0.54,
    color: COLORS.encre,
  },
  eyebrow: {
    fontFamily: FONTS.monoMedium,
    fontSize: 9.5,
    letterSpacing: 1.33,
    textTransform: 'uppercase',
    color: COLORS.encre3,
  },
  mono: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.encre },
  corps: { fontFamily: FONTS.texte, fontSize: 15, lineHeight: 22, color: COLORS.encre2 },

  carte: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligne,
    borderRadius: RADIUS.m,
  },

  btn: {
    width: '100%',
    borderRadius: RADIUS.m,
    backgroundColor: COLORS.encre,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    minHeight: 48, // cible tactile
  },
  btnFantome: { backgroundColor: 'transparent', paddingVertical: 12, minHeight: 44 },
  btnSortie: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligneForte,
  },
  btnPresse: { transform: [{ scale: 0.985 }] },
  btnInerte: { opacity: 0.4 },
  btnTexte: { fontFamily: FONTS.texteSemi, fontSize: 15, color: COLORS.surface },
  btnTexteFantome: { fontFamily: FONTS.texteMedium, color: COLORS.encre2 },
  btnTexteSortie: { color: COLORS.encre },

  jauge: { height: 3, backgroundColor: COLORS.ligne, borderRadius: 2, overflow: 'hidden' },
  jaugeFill: { height: '100%', backgroundColor: COLORS.trace, borderRadius: 2 },
});
