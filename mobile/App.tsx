import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { useWalkedia } from './src/hooks/useWalkedia';
import { StartScreen } from './src/screens/StartScreen';
import { MapScreen } from './src/screens/MapScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TabBar, TabName } from './src/components/TabBar';
import { COLORS } from './src/theme';

export default function App() {
  const walkedia = useWalkedia();
  const { state, actions } = walkedia;
  const [tab, setTab] = useState<TabName>('adventure');

  if (!state.ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accentCyan} />
        <StatusBar style="light" />
      </View>
    );
  }

  if (!state.mapReady) {
    return (
      <View style={styles.fill}>
        <StartScreen status={state.startStatus} onLocate={actions.requestLocationAndInit} />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <MapScreen walkedia={walkedia} />
      {tab === 'search' && <SearchScreen />}
      {tab === 'profile' && <ProfileScreen progress={state.progress} />}
      <TabBar active={tab} onChange={setTab} />
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
});
