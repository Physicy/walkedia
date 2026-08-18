// Marqueur de carrefour "onde de capture" : gris tant que non complété, bleu
// une fois complété. `animated` déclenche une pulsation en boucle de
// l'anneau extérieur — réservé à un petit sous-ensemble de carrefours
// proches (voir MapScreen.tsx) car ça force tracksViewChanges={true} sur le
// Marker parent, coûteux à grande échelle sur react-native-maps.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { COLORS } from '../theme';

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

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.wrap}>
      {animated && <Animated.View style={[styles.ring, { borderColor: COLORS.trace, opacity, transform: [{ scale }] }]} />}
      {done ? (
        <View style={styles.dotComplet} />
      ) : (
        <View style={styles.dotRestant} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 1.5 },
  dotComplet: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: COLORS.trace,
    borderWidth: 1.8,
    borderColor: COLORS.traceFonce,
  },
  dotRestant: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: COLORS.surface,
    borderWidth: 1.8,
    borderColor: 'rgba(26, 27, 46, 0.45)',
  },
});
