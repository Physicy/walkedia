// Connexion, devenue facultative.
//
// Elle était une porte : rien de l'app ne s'affichait sans session Supabase.
// C'était à l'envers, parce que la progression a toujours vécu en local
// (storage.ts) et que le compte ne fait que la transporter d'un téléphone à
// l'autre. L'écran devient donc une proposition, avec une sortie explicite,
// et se rouvre depuis les réglages.
//
// La connexion par lien e-mail n'est pas dans la maquette mais reste ici : elle
// fonctionne, et c'est la seule voie pour qui ne veut ni Google ni Apple.

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONTS, RADIUS } from '../theme';
import { Bouton, Corps } from '../components/ui';
import { Icone } from '../components/Icones';
import type { useAuth } from '../hooks/useAuth';

export function LoginScreen({
  auth,
  onSkip,
}: {
  auth: ReturnType<typeof useAuth>;
  onSkip: () => void;
}) {
  const [email, setEmail] = useState('');
  const [parEmail, setParEmail] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const lancer = async (fn: () => Promise<void>) => {
    setErreur(null);
    try {
      await fn();
    } catch (e: any) {
      setErreur(e?.message || 'Une erreur est survenue.');
    }
  };

  if (!auth.isConfigured) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        <Entete onFermer={onSkip} />
        <View style={styles.corps}>
          <Text style={styles.titre}>Le compte n'est pas configuré.</Text>
          <Corps>
            Renseigne mobile/.env à partir de .env.example pour activer la connexion. En attendant,
            tout le reste de l'app fonctionne : ton relevé est gardé sur cet appareil.
          </Corps>
          <View style={styles.actions}>
            <Bouton onPress={onSkip}>Continuer sans compte</Bouton>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.wrap, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Entete onFermer={onSkip} />
      <ScrollView
        contentContainerStyle={[styles.corps, { paddingBottom: insets.bottom + 26 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.titre}>
          Garde ton relevé, <Text style={styles.titreAccent}>même en changeant de téléphone</Text>.
        </Text>
        <Corps>
          Sans compte, tout fonctionne, mais ton relevé vit uniquement sur cet appareil. Avec un
          compte, il te suit et tu entres au classement.
        </Corps>

        {auth.emailSent ? (
          <View style={styles.noteSys}>
            <Icone nom="coche" size={16} color={COLORS.trace} />
            <Text style={styles.noteSysTexte}>
              Lien de connexion envoyé à {email.trim()}. Ouvre-le depuis ce téléphone.
            </Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <Bouton
              variante="sortie"
              busy={auth.busy}
              onPress={() => lancer(auth.signInWithGoogle)}
              icone={<Text style={styles.marque}>G</Text>}
            >
              Continuer avec Google
            </Bouton>
            <Bouton
              variante="sortie"
              busy={auth.busy}
              onPress={() => lancer(auth.signInWithApple)}
              icone={<Text style={styles.marque}>A</Text>}
            >
              Continuer avec Apple
            </Bouton>

            {parEmail ? (
              <View style={styles.bloqEmail}>
                <TextInput
                  style={styles.champ}
                  placeholder="Adresse e-mail"
                  placeholderTextColor={COLORS.encre3}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  editable={!auth.busy}
                />
                <Bouton
                  disabled={!email.trim()}
                  busy={auth.busy}
                  onPress={() => lancer(() => auth.signInWithEmail(email))}
                >
                  Recevoir un lien de connexion
                </Bouton>
              </View>
            ) : (
              <Pressable onPress={() => setParEmail(true)} style={styles.lienZone}>
                <Text style={styles.lien}>Utiliser mon adresse e-mail</Text>
              </Pressable>
            )}

            <Bouton variante="fantome" onPress={onSkip}>
              Continuer sans compte
            </Bouton>
          </View>
        )}

        {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Entete({ onFermer }: { onFermer: () => void }) {
  return (
    <View style={styles.entete}>
      <Pressable style={styles.rond} onPress={onFermer} accessibilityRole="button" accessibilityLabel="Fermer">
        <Icone nom="fermer" size={18} color={COLORS.encre} strokeWidth={1.9} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.papier },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  rond: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligneForte,
    alignItems: 'center',
    justifyContent: 'center',
  },

  corps: { paddingHorizontal: 24, flexGrow: 1, justifyContent: 'center' },
  titre: {
    fontFamily: FONTS.display,
    fontSize: 30,
    lineHeight: 32,
    letterSpacing: -0.75,
    color: COLORS.encre,
    marginBottom: 12,
  },
  titreAccent: { color: COLORS.trace },

  actions: { gap: 10, marginTop: 28 },
  marque: { fontFamily: FONTS.texteBold, fontSize: 15, color: COLORS.encre },

  bloqEmail: { gap: 10 },
  champ: {
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.ligneForte,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.m,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: FONTS.texte,
    fontSize: 14,
    color: COLORS.encre,
  },
  lienZone: { alignItems: 'center', paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  lien: {
    fontFamily: FONTS.texteSemi,
    fontSize: 13,
    color: COLORS.encre2,
    textDecorationLine: 'underline',
  },

  noteSys: {
    flexDirection: 'row',
    gap: 11,
    padding: 13,
    marginTop: 28,
    backgroundColor: COLORS.tracePale,
    borderRadius: RADIUS.m,
  },
  noteSysTexte: { flex: 1, fontFamily: FONTS.texte, fontSize: 12.5, lineHeight: 18, color: COLORS.encre2 },

  erreur: { fontFamily: FONTS.texte, fontSize: 13, color: COLORS.alerte, textAlign: 'center', marginTop: 14 },
});
