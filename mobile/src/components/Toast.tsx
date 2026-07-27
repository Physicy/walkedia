import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme';

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: '7%',
    right: '7%',
    bottom: 150,
    zIndex: 1750,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  text: { color: COLORS.text, fontSize: 15, textAlign: 'center' },
});
