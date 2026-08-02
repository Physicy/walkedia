import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme';
import type { useAuth } from '../hooks/useAuth';

export function AccountSection({ auth, syncing }: { auth: ReturnType<typeof useAuth>; syncing: boolean }) {
  if (!auth.isConfigured) {
    return (
      <View style={styles.box}>
        <Text style={styles.muted}>
          Compte non configuré — renseigne mobile/.env à partir de .env.example pour activer la connexion.
        </Text>
      </View>
    );
  }

  if (auth.loading) {
    return (
      <View style={styles.box}>
        <ActivityIndicator color={COLORS.accentCyan} />
      </View>
    );
  }

  if (!auth.user) {
    return (
      <View style={styles.box}>
        <TouchableOpacity style={styles.googleBtn} onPress={auth.signInWithGoogle} disabled={auth.busy}>
          <Text style={styles.btnText}>Continuer avec Google</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.appleBtn} onPress={auth.signInWithApple} disabled={auth.busy}>
          <Text style={styles.btnTextWhite}>Continuer avec Apple</Text>
        </TouchableOpacity>
        {auth.busy && <ActivityIndicator color={COLORS.accentCyan} style={{ marginTop: 8 }} />}
      </View>
    );
  }

  const name = auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || auth.user.email || 'Compte';
  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Text style={styles.connected} numberOfLines={1}>
          Connecté : {name}
        </Text>
        <TouchableOpacity onPress={auth.signOut}>
          <Text style={styles.signOut}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
      {syncing && <Text style={styles.muted}>Synchronisation…</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderColor: 'rgba(148,163,184,0.15)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  connected: { color: COLORS.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  signOut: { color: COLORS.accentAmber, fontSize: 13 },
  muted: { color: COLORS.textDim, fontSize: 12 },
  googleBtn: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  appleBtn: {
    backgroundColor: '#000',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: '#0f172a', fontSize: 14, fontWeight: '600' },
  btnTextWhite: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
