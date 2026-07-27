import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { requestPermissions, startLocationTracking } from './services/locationService.js';
import { loadProgress } from './services/storageService.js';
import MapScreen from './screens/MapScreen.js';

export default function App() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const granted = await requestPermissions();
        setPermissionGranted(granted);
        if (granted) {
          await startLocationTracking(() => {
            // GPS fixes seront gérés par le contexte/hook global
          });
        }
        await loadProgress();
      } catch (error) {
        console.error('Init error:', error);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!permissionGranted) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Location permission is required</Text>
      </View>
    );
  }

  return <MapScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  error: {
    color: '#e2e8f0',
    fontSize: 16,
  },
});
