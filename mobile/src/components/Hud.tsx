import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme';

export function Hud({
  score,
  edgesLabel,
  interLabel,
}: {
  score: number;
  edgesLabel: string;
  interLabel: string;
}) {
  return (
    <View style={styles.row} pointerEvents="none">
      <View style={styles.scoreBox}>
        <Text style={styles.scoreValue}>{score}</Text>
        <Text style={styles.scoreLabel}>pts</Text>
      </View>
      <View style={styles.statsBox}>
        <Text style={styles.statLine}>
          <Text style={styles.statValue}>{edgesLabel}</Text> tronçons
        </Text>
        <Text style={styles.statLine}>
          <Text style={styles.statValue}>{interLabel}</Text> intersections
        </Text>
      </View>
    </View>
  );
}

const panel = {
  backgroundColor: COLORS.panel,
  borderColor: COLORS.border,
  borderWidth: 1,
  borderRadius: 14,
};

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 14,
    paddingHorizontal: 12,
  },
  scoreBox: { ...panel, paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  scoreValue: { fontSize: 26, fontWeight: '700', color: COLORS.accentGreen },
  scoreLabel: { color: COLORS.textMuted, fontSize: 12, marginLeft: 4 },
  statsBox: { ...panel, paddingVertical: 8, paddingHorizontal: 14 },
  statLine: { fontSize: 12, color: '#cbd5e1', textAlign: 'right', lineHeight: 18 },
  statValue: { fontWeight: '600', color: COLORS.text },
});
