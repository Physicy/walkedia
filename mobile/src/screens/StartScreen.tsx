import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme';

export function StartScreen({ status, onLocate }: { status: string; onLocate: () => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Walkedia</Text>
        <Text style={styles.desc}>
          Explore le réseau piéton autour de toi.{'\n'}
          Parcours des chemins pour les découvrir et complète des intersections pour marquer des points.
        </Text>
        <TouchableOpacity style={styles.button} onPress={onLocate}>
          <Text style={styles.buttonText}>Charger la carte autour de moi</Text>
        </TouchableOpacity>
        {!!status && <Text style={styles.status}>{status}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { maxWidth: 420, alignItems: 'center' },
  title: { fontSize: 40, fontWeight: '800', color: COLORS.accentCyan, marginBottom: 12, textAlign: 'center' },
  desc: { color: COLORS.textMuted, lineHeight: 22, marginBottom: 24, textAlign: 'center' },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  status: { color: COLORS.accentAmber, fontSize: 13, marginTop: 14, textAlign: 'center' },
});
