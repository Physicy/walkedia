// Version animée du logo (voir logo/walkedia-65-anime-pointilles.svg à la
// racine du repo) pour l'écran de connexion. react-native-svg n'exécute pas
// les balises SMIL (<animate>, <animateTransform>) du fichier source : les
// deux animations sont donc reconstruites ici avec l'API Animated — anneau
// pointillé qui tourne, onde qui s'étend en s'estompant (effet "ping" GPS).
// L'anneau du milieu et le point central sont statiques dans cette variante.
//
// Coordonnées et transform du <g> copiées telles quelles du SVG source pour
// ne pas avoir à recalculer une géométrie à la main.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const GROUP_TRANSFORM = 'translate(23.88 -10.83) scale(1.1713)';
const CX = 159.03;
const CY = 184.32;
const CROSS_A =
  'M 47.55 221.70 Q 122.36 219.64 165.15 207.06 Q 251.47 184.85 387.32 130.16 Q 399.91 118.96 383.40 115.60 Q 238.60 137.09 152.90 161.58 Q 109.49 171.88 43.63 207.15 Q 31.04 218.35 47.55 221.70 Z';
const CROSS_B =
  'M 121.76 65.41 Q 123.65 144.43 136.17 190.02 Q 157.36 279.61 210.47 421.15 Q 221.43 433.95 225.09 417.50 Q 205.35 267.64 181.88 178.62 Q 171.64 132.46 136.39 61.77 Q 125.43 48.96 121.76 65.41 Z';

export function LogoAnime({ size = 140 }: { size?: number }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const ping = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const rotate = Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: false })
    );
    const pingLoop = Animated.loop(
      Animated.timing(ping, { toValue: 1, duration: 3200, easing: Easing.out(Easing.cubic), useNativeDriver: false })
    );
    rotate.start();
    pingLoop.start();
    return () => {
      rotate.stop();
      pingLoop.stop();
    };
  }, [rotation, ping]);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const pingRadius = ping.interpolate({ inputRange: [0, 1], outputRange: [28.94, 115.34] });
  const pingOpacity = ping.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });
  const pingStrokeWidth = ping.interpolate({ inputRange: [0, 1], outputRange: [4.07, 1.8] });

  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <G transform={GROUP_TRANSFORM}>
        <Path d={CROSS_A} fill="#6C5DF4" />
        <Path d={CROSS_B} fill="#6C5DF4" />
        <AnimatedCircle
          cx={CX}
          cy={CY}
          r={94.54}
          fill="none"
          stroke="#22D3EE"
          strokeWidth={1.86}
          strokeOpacity={0.9}
          strokeDasharray="4.2 13.2"
          strokeLinecap="round"
          rotation={rotate as unknown as number}
          origin={`${CX}, ${CY}`}
        />
        <Circle cx={CX} cy={CY} r={52.62} fill="none" stroke="#22D3EE" strokeWidth={2.78} strokeOpacity={0.55} />
        <AnimatedCircle
          cx={CX}
          cy={CY}
          r={pingRadius as unknown as number}
          fill="none"
          stroke="#22D3EE"
          strokeWidth={pingStrokeWidth as unknown as number}
          strokeOpacity={pingOpacity}
        />
        <Circle cx={CX} cy={CY} r={22.12} fill="#9C90FF" />
      </G>
    </Svg>
  );
}
