// Marqueur de carrefour "onde de capture" : gris tant que non complété, bleu
// une fois complété. `animated` déclenche une pulsation en boucle de
// l'anneau extérieur — réservé à un petit sous-ensemble de carrefours
// proches (voir MapScreen.tsx) car ça force tracksViewChanges={true} sur le
// Marker parent, coûteux à grande échelle sur react-native-maps.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { progressColor } from '../logic/color';

const SIZE = 28;

export function CaptureWave({ done, animated }: { done: boolean; animated: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) return;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [animated, pulse]);

  const color = progressColor(done ? 1 : 0);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <View style={styles.wrap}>
      {animated && <Animated.View style={[styles.ring, { borderColor: color, opacity, transform: [{ scale }] }]} />}
      <View style={[styles.staticRing, { borderColor: color }]} />
      <View
        style={[
          styles.dot,
          {
            backgroundColor: color,
            width: done ? 13 : 9,
            height: done ? 13 : 9,
            borderRadius: done ? 6.5 : 4.5,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 1.5 },
  staticRing: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    opacity: 0.5,
  },
  dot: { borderWidth: 1.5, borderColor: '#0f172a' },
});
