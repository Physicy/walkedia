import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../theme';

export type TabName = 'adventure' | 'search' | 'profile';

const TABS: { name: TabName; icon: string; labelKey: string }[] = [
  { name: 'adventure', icon: '🗺️', labelKey: 'tabbar.adventure' },
  { name: 'search', icon: '🔍', labelKey: 'tabbar.search' },
  { name: 'profile', icon: '👤', labelKey: 'tabbar.profile' },
];

export const TAB_BAR_BASE_HEIGHT = 54;

export function TabBar({ active, onChange }: { active: TabName; onChange: (t: TabName) => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((tab) => (
        <TouchableOpacity key={tab.name} style={styles.btn} onPress={() => onChange(tab.name)} activeOpacity={0.7}>
          <Text style={styles.icon}>{tab.icon}</Text>
          <Text style={[styles.label, active === tab.name && styles.labelActive]}>{t(tab.labelKey)}</Text>
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
