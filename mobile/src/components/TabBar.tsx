import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';

export type TabName = 'adventure' | 'search' | 'profile';

const TABS: { name: TabName; icon: string; label: string }[] = [
  { name: 'adventure', icon: '🗺️', label: 'Aventure' },
  { name: 'search', icon: '🔍', label: 'Recherche' },
  { name: 'profile', icon: '👤', label: 'Profil' },
];

export const TAB_BAR_BASE_HEIGHT = 54;

export function TabBar({ active, onChange }: { active: TabName; onChange: (t: TabName) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => (
        <TouchableOpacity key={t.name} style={styles.btn} onPress={() => onChange(t.name)} activeOpacity={0.7}>
          <Text style={styles.icon}>{t.icon}</Text>
          <Text style={[styles.label, active === t.name && styles.labelActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1700,
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.97)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.2)',
    paddingTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 2 },
  icon: { fontSize: 20 },
  label: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  labelActive: { color: COLORS.accentCyan },
});
