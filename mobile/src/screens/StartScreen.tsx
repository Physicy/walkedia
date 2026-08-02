// Pas d'écran d'accueil : juste le minimum pendant la géolocalisation
// automatique au lancement (voir App.tsx). Un statut d'erreur (permission
// refusée, GPS indisponible…) affiche un bouton pour réessayer manuellement.

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme';

export function StartScreen({ status, onLocate }: { status: string; onLocate: () => void }) {
  const isError = /refusé|indisponible|dépassé/.test(status);
  return (
    <View style={styles.wrap}>
      {isError ? (
        <>
          <Text style={styles.status}>{status}</Text>
          <TouchableOpacity style={styles.button} onPress={onLocate}>
            <Text style={styles.buttonText}>Réessayer</Text>
          </TouchableOpacity>
        </>
      ) : (
        <ActivityIndicator color={COLORS.accentCyan} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  button: { backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 999, marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  status: { color: COLORS.accentAmber, fontSize: 14, textAlign: 'center', maxWidth: 340 },
});
