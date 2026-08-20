// Marqueur de carrefour "onde de capture" : gris tant que non complété,
// accent du joueur une fois complété. `animated` déclenche une pulsation en
// boucle de l'anneau extérieur — réservé à un petit sous-ensemble de
// carrefours proches (voir MapScreen.tsx) car ça force
// tracksViewChanges={true} sur le Marker parent, coûteux à grande échelle sur
// react-native-maps.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { nuancesTrace } from '../logic/color';

const SIZE = 24;

export function CaptureWave({ done, animated, couleur }: { done: boolean; animated: boolean; couleur: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const nuances = nuancesTrace(couleur);

  useEffect(() => {
    if (!animated) return;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [animated, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 0] });

  return (
    <View style={styles.wrap}>
      {animated && <Animated.View style={[styles.ring, { borderColor: couleur, opacity, transform: [{ scale }] }]} />}
      {done ? (
        <View style={[styles.dotComplet, { backgroundColor: couleur, borderColor: nuances.fonce }]} />
      ) : (
        <View style={styles.dotRestant} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2 },
  dotComplet: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 1.5,
  },
  dotRestant: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#FBFAFD',
    borderWidth: 1.5,
    borderColor: 'rgba(26, 27, 46, 0.45)',
  },
});
