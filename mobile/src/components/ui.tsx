// Éléments partagés du système encre et papier.
//
// Les interlettrages du design sont exprimés en `em` ; React Native ne connaît
// que des points, donc chaque valeur est convertie à la taille de son style
// (0.14em sur 9.5px vaut 1.33pt).

import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { COLORS, FONTS, RADIUS } from '../theme';
import { AVATARS } from '../logic/avatars';

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

// Initiales d'un joueur à partir de son nom affiché — jamais de photo (le
// serveur n'en sert pas), donc un jeton textuel partout où un avatar
// apparaîtrait : classement, amis, profil d'un autre joueur, compte.
export function initiales(nom: string | null | undefined): string {
  const mots = (nom || '').trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return '?';
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

export function Jeton({ nom, size = 34 }: { nom: string | null | undefined; size?: number }) {
  return (
    <View style={[styles.jeton, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.jetonTexte, { fontSize: size * 0.36 }]}>{initiales(nom)}</Text>
    </View>
  );
}

// Avatar choisi (voir logic/avatars.ts) si l'id en correspond bien un ;
// retombe sur les initiales (Jeton) sinon — pas d'avatar choisi, ou un autre
// joueur qui n'en a pas encore pris un.
export function Avatar({
  avatarId,
  nom,
  size = 34,
}: {
  avatarId: string | null | undefined;
  nom: string | null | undefined;
  size?: number;
}) {
  const source = avatarId ? AVATARS[avatarId] : undefined;
  if (!source) return <Jeton nom={nom} size={size} />;
  return (
    <Image
      source={source}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      resizeMode="cover"
    />
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


  jeton: { backgroundColor: COLORS.encre, alignItems: 'center', justifyContent: 'center' },
  jetonTexte: { fontFamily: FONTS.monoSemi, color: COLORS.surface },
});
