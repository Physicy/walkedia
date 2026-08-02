import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';
import { TAB_BAR_BASE_HEIGHT } from './TabBar';

export function Toast({ message }: { message: string | null }) {
  const insets = useSafeAreaInsets();
  if (!message) return null;
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_BASE_HEIGHT + 84 }]} pointerEvents="none">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: '7%',
    right: '7%',
    zIndex: 1750,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  text: { color: COLORS.text, fontSize: 15, textAlign: 'center' },
});
