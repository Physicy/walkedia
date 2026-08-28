// Feu pixel art de la carte "Série" (ProfileScreen.tsx) : les calques
// s'additionnent avec la série plutôt que de se remplacer (des braises à 1
// jour jusqu'au brasier à 14), reprenant tels quels les pixels et seuils de
// la maquette (design-profil-source.html). `shape-rendering: crispEdges` n'a
// pas d'équivalent RN — `react-native-svg` rend déjà les <Rect> nets à cette
// taille, pas de flou à corriger.

import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

export function FeuSerie({ streak, size = 34 }: { streak: number; size?: number }) {
  const allume = streak > 0;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.stopAnimation();
    anim.setValue(0);
    if (!allume) return;
    const duree = streak >= 7 ? 500 : 900;
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: duree, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: duree, useNativeDriver: true }),
      ])
    );
    boucle.start();
    return () => boucle.stop();
  }, [allume, streak, anim]);

  const scaleY = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -1] });

  return (
    <AnimatedSvg
      width={size}
      height={(size * 14) / 11}
      viewBox="0 0 11 14"
      style={{ opacity: allume ? 1 : 0.35, transform: [{ scaleY }, { translateY }] }}
    >
      {streak >= 1 && (
        <G fill="#8B3E10">
          <Rect x={3} y={13} width={5} height={1} />
          <Rect x={4} y={12} width={3} height={1} />
        </G>
      )}
      {streak >= 1 && (
        <G fill="#D97B29">
          <Rect x={4} y={11} width={3} height={1} />
          <Rect x={5} y={10} width={1} height={1} />
        </G>
      )}
      {streak >= 3 && (
        <G fill="#E8912F">
          <Rect x={3} y={10} width={5} height={1} />
          <Rect x={4} y={9} width={3} height={1} />
          <Rect x={5} y={8} width={1} height={1} />
        </G>
      )}
      {streak >= 7 && (
        <G fill="#F5B23C">
          <Rect x={4} y={7} width={3} height={1} />
          <Rect x={5} y={6} width={1} height={1} />
          <Rect x={2} y={11} width={1} height={1} />
          <Rect x={8} y={11} width={1} height={1} />
        </G>
      )}
      {streak >= 14 && (
        <G fill="#FCD95E">
          <Rect x={5} y={4} width={1} height={2} />
          <Rect x={5} y={2} width={1} height={1} />
          <Rect x={2} y={8} width={1} height={1} />
          <Rect x={8} y={9} width={1} height={1} />
        </G>
      )}
    </AnimatedSvg>
  );
}
