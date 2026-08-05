// Écran de connexion obligatoire affiché avant tout le reste de l'app (voir
// App.tsx) : tant qu'il n'y a pas de session Supabase, ni la carte ni aucun
// autre écran ne sont montés.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../theme';
import type { useAuth } from '../hooks/useAuth';

export function LoginScreen({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || 'Une erreur est survenue.');
    }
  };

  if (!auth.isConfigured) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Walkedia</Text>
        <Text style={styles.status}>
          Compte non configuré — renseigne mobile/.env à partir de .env.example pour activer la connexion.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Walkedia</Text>
      <Text style={styles.subtitle}>Connecte-toi pour continuer</Text>

      {auth.emailSent ? (
        <Text style={styles.status}>
          Lien de connexion envoyé à {email.trim()}. Ouvre-le depuis ce téléphone pour continuer.
        </Text>
      ) : (
        <>
          <TouchableOpacity style={styles.googleBtn} onPress={() => run(auth.signInWithGoogle)} disabled={auth.busy}>
            <Text style={styles.btnText}>Continuer avec Google</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.appleBtn} onPress={() => run(auth.signInWithApple)} disabled={auth.busy}>
            <Text style={styles.btnTextWhite}>Continuer avec Apple</Text>
          </TouchableOpacity>

          <View style={styles.sep}>
            <View style={styles.sepLine} />
            <Text style={styles.sepText}>ou</Text>
            <View style={styles.sepLine} />
          </View>

          <TextInput
            style={styles.input}
            placeholder="Adresse e-mail"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!auth.busy}
          />
          <TouchableOpacity
            style={[styles.emailBtn, (!email.trim() || auth.busy) && styles.btnDisabled]}
            onPress={() => run(() => auth.signInWithEmail(email))}
            disabled={!email.trim() || auth.busy}
          >
            <Text style={styles.btnTextWhite}>Recevoir un lien de connexion</Text>
          </TouchableOpacity>
        </>
      )}

      {auth.busy && <ActivityIndicator color={COLORS.accentCyan} style={styles.spinner} />}
      {error && <Text style={styles.error}>{error}</Text>}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: COLORS.textMuted, marginBottom: 28 },
  googleBtn: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  appleBtn: {
    backgroundColor: '#000',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    marginTop: 10,
  },
  sep: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 340, marginVertical: 18, gap: 10 },
  sepLine: { flex: 1, height: 1, backgroundColor: 'rgba(148,163,184,0.25)' },
  sepText: { color: COLORS.textDim, fontSize: 12 },
  input: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderColor: 'rgba(148,163,184,0.25)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontSize: 15,
  },
  emailBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    marginTop: 10,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  btnTextWhite: { color: '#fff', fontSize: 15, fontWeight: '600' },
  spinner: { marginTop: 16 },
  status: { color: COLORS.accentAmber, fontSize: 14, textAlign: 'center', maxWidth: 340 },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center', maxWidth: 340, marginTop: 14 },
});
