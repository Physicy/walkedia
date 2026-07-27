import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme';

export function SearchScreen() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Recherche</Text>
      <Text style={styles.placeholder}>Bientôt disponible…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    zIndex: 1600,
    backgroundColor: COLORS.bg,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  title: { fontSize: 21, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  placeholder: { color: COLORS.textDim, textAlign: 'center', marginTop: '35%' },
});
