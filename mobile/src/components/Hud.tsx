import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
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
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View style={[styles.row, { top: insets.top + 8 }]} pointerEvents="none">
      <View style={styles.scoreBox}>
        <Text style={styles.scoreValue}>{score}</Text>
        <Text style={styles.scoreLabel}>{t('map.hudPts')}</Text>
      </View>
      <View style={styles.statsBox}>
        <Text style={styles.statLine}>
          <Text style={styles.statValue}>{edgesLabel}</Text> {t('map.hudSegments')}
        </Text>
        <Text style={styles.statLine}>
          <Text style={styles.statValue}>{interLabel}</Text> {t('map.hudIntersections')}
        </Text>
      </View>
    </View>
  );
}

const panel = {
  backgroundColor: COLORS.panel,
  borderColor: COLORS.border,
  borderWidth: 1,
  borderRadius: 16,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.35,
  shadowRadius: 8,
  elevation: 5,
};

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
  },
  scoreBox: { ...panel, paddingVertical: 7, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  scoreValue: { fontSize: 22, fontWeight: '700', color: COLORS.accentGreen },
  scoreLabel: { color: COLORS.textMuted, fontSize: 11, marginLeft: 3 },
  statsBox: { ...panel, paddingVertical: 7, paddingHorizontal: 13 },
  statLine: { fontSize: 11.5, color: '#cbd5e1', textAlign: 'right', lineHeight: 17 },
  statValue: { fontWeight: '600', color: COLORS.text },
});
