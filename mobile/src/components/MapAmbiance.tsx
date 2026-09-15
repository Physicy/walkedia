// Ce qui se pose PAR-DESSUS la carte native dans les modes dessinés (voir
// logic/mapModes.ts) : texture d'écran, voile de nuit, neige ou feuilles.
// Tout est en pointerEvents="none" : la carte reste manipulable au travers.
//
// Monté juste après la MapView et avant le chrome (boutons, panneaux), qui
// reste donc net quel que soit le mode.

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { ApparenceCarte } from '../logic/mapModes';

export function MapAmbiance({ apparence }: { apparence: ApparenceCarte }) {
  const { mode, saison, nuit } = apparence;
  if (mode.fond !== 'dessin') return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {mode.trame !== 'aucune' && <Trame type={mode.trame} />}
      {nuit && <VoileNuit />}
      {saison === 'hiver' && <Particules key="neige" genre="neige" />}
      {saison === 'automne' && <Particules key="feuilles" genre="feuilles" />}
    </View>
  );
}

// Lignes de balayage fines pour les modes pixel, grille de cristaux liquides
// pour le rétro. Assez discrètes pour ne jamais gêner la lecture des points.
function Trame({ type }: { type: 'balayage' | 'lcd' }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        {type === 'lcd' ? (
          <Pattern id="trame" width={4} height={4} patternUnits="userSpaceOnUse">
            <Rect x={0} y={3} width={4} height={1} fill="#0F380F" fillOpacity={0.14} />
            <Rect x={3} y={0} width={1} height={3} fill="#0F380F" fillOpacity={0.14} />
          </Pattern>
        ) : (
          <Pattern id="trame" width={3} height={3} patternUnits="userSpaceOnUse">
            <Rect x={0} y={2} width={3} height={1} fill="#000000" fillOpacity={0.06} />
          </Pattern>
        )}
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#trame)" />
    </Svg>
  );
}

// Assombrit les bords de l'écran : le centre, là où se trouve le joueur après
// un recentrage, reste lisible.
function VoileNuit() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <RadialGradient id="nuit" cx="50%" cy="55%" r="70%">
          <Stop offset="0.3" stopColor="#060A1E" stopOpacity={0} />
          <Stop offset="1" stopColor="#060A1E" stopOpacity={0.62} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#nuit)" />
    </Svg>
  );
}

interface Genre {
  nombre: number;
  couleurs: string[];
  tailles: number[];
  duree: [number, number]; // ms pour traverser l'écran, min et max
  derive: number; // balancement horizontal, en px
  tourne: boolean;
}

// Des carrés plutôt que des ronds : ils tombent sur une carte en aplats.
const GENRES: Record<'neige' | 'feuilles', Genre> = {
  neige: { nombre: 26, couleurs: ['#FFFFFF', '#EAF2FA'], tailles: [3, 4, 5], duree: [7000, 13000], derive: 14, tourne: false },
  feuilles: {
    nombre: 14,
    couleurs: ['#D9822B', '#B5471F', '#E3B23C', '#8E3B1A'],
    tailles: [5, 6],
    duree: [9000, 15000],
    derive: 28,
    tourne: true,
  },
};

function Particules({ genre }: { genre: keyof typeof GENRES }) {
  const { width, height } = useWindowDimensions();
  const g = GENRES[genre];
  // Tirées une fois par montage : un nouveau rendu de la carte (un par fix
  // GPS pendant une session) ne doit pas redistribuer les flocons.
  const graines = useMemo(
    () =>
      Array.from({ length: g.nombre }, (_, i) => ({
        x: Math.random(),
        taille: g.tailles[i % g.tailles.length],
        couleur: g.couleurs[i % g.couleurs.length],
        duree: g.duree[0] + Math.random() * (g.duree[1] - g.duree[0]),
        delai: Math.random() * g.duree[0],
        sens: i % 2 ? 1 : -1,
      })),
    [g]
  );
  return (
    <>
      {graines.map((p, i) => (
        <Particule key={i} {...p} largeur={width} hauteur={height} derive={g.derive} tourne={g.tourne} />
      ))}
    </>
  );
}

function Particule({
  x,
  taille,
  couleur,
  duree,
  delai,
  sens,
  largeur,
  hauteur,
  derive,
  tourne,
}: {
  x: number;
  taille: number;
  couleur: string;
  duree: number;
  delai: number;
  sens: number;
  largeur: number;
  hauteur: number;
  derive: number;
  tourne: boolean;
}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delai),
      Animated.loop(Animated.timing(t, { toValue: 1, duration: duree, easing: Easing.linear, useNativeDriver: true })),
    ]);
    anim.start();
    return () => anim.stop();
  }, [t, delai, duree]);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-12, hauteur + 12] });
  const translateX = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, derive * sens, 0, -derive * sens, 0],
  });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${sens * 360}deg`] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x * largeur,
        top: 0,
        width: taille,
        height: taille,
        backgroundColor: couleur,
        opacity: 0.9,
        transform: tourne ? [{ translateY }, { translateX }, { rotate }] : [{ translateY }, { translateX }],
      }}
    />
  );
}
