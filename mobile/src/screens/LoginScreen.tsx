// Connexion : porte d'entrée obligatoire, montée avant tout le reste de
// l'app (voir App.tsx) tant qu'il n'y a pas de session Supabase. La
// progression continue de vivre en local (storage.ts) une fois connecté —
// le compte ne fait que la transporter d'un téléphone à l'autre — mais il
// n'y a plus de sortie sans compte : impossible de perdre son relevé faute
// d'avoir jamais rattaché un compte dessus.
//
// La connexion par lien e-mail n'est pas dans la maquette mais reste ici : elle
// fonctionne, et c'est la seule voie pour qui ne veut ni Google ni Apple. Son
// icône est un avatar tiré au sort parmi ceux de la personnalisation (voir
// logic/avatars.ts) à chaque montage de l'écran — juste un peu de variété,
// aucun rapport avec l'avatar réellement choisi par qui se connecte.

import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { COLORS, FONTS, RADIUS } from '../theme';
import { Bouton, Corps } from '../components/ui';
import { Icone } from '../components/Icones';
import { LogoAnime } from '../components/LogoAnime';
import { LogoApple, LogoGoogle } from '../components/MarquesAuth';
import { AVATARS, AVATAR_IDS } from '../logic/avatars';
import type { useAuth } from '../hooks/useAuth';

function avatarEmailAleatoire(): string {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

export function LoginScreen({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [parEmail, setParEmail] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avatarEmail] = useState(avatarEmailAleatoire);
  const insets = useSafeAreaInsets();

  const lancer = async (fn: () => Promise<void>) => {
    setErreur(null);
    try {
      await fn();
    } catch (e: any) {
      setErreur(e?.message || t('login.genericError'));
    }
  };

  if (!auth.isConfigured) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        <View style={styles.corps}>
          <LogoAnime size={100} />
          <Text style={styles.titre}>{t('login.notConfiguredTitle')}</Text>
          <Corps>{t('login.notConfiguredBody')}</Corps>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.wrap, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.corps, { paddingBottom: insets.bottom + 26 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <LogoAnime size={128} />
          <Text style={styles.slogan}>{t('login.slogan')}</Text>
        </View>

        {auth.emailSent ? (
          <View style={styles.noteSys}>
            <Icone nom="coche" size={16} color={COLORS.trace} />
            <Text style={styles.noteSysTexte}>{t('login.magicLinkSent', { email: email.trim() })}</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <View style={styles.groupeSocial}>
              <Bouton
                variante="sortie"
                disabled={auth.busy}
                busy={auth.busyProvider === 'google'}
                onPress={() => lancer(auth.signInWithGoogle)}
                icone={<LogoGoogle size={18} />}
              >
                {t('account.continueGoogle')}
              </Bouton>
              <Bouton
                variante="sortie"
                disabled={auth.busy}
                busy={auth.busyProvider === 'apple'}
                onPress={() => lancer(auth.signInWithApple)}
                icone={<LogoApple size={16} color={COLORS.encre} />}
              >
                {t('account.continueApple')}
              </Bouton>
            </View>

            <View style={styles.separateur} />

            {parEmail ? (
              <View style={styles.bloqEmail}>
                <TextInput
                  style={styles.champ}
                  placeholder={t('login.emailPlaceholder')}
                  placeholderTextColor={COLORS.encre3}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  editable={!auth.busy}
                />
                <Bouton
                  disabled={!email.trim() || auth.busy}
                  busy={auth.busyProvider === 'email'}
                  onPress={() => lancer(() => auth.signInWithEmail(email))}
                >
                  {t('login.sendMagicLink')}
                </Bouton>
              </View>
            ) : (
              <Bouton
                variante="sortie"
                disabled={auth.busy}
                onPress={() => setParEmail(true)}
                icone={<Image source={AVATARS[avatarEmail]} style={styles.avatarEmail} />}
              >
                {t('login.continueWithEmail')}
              </Bouton>
            )}
          </View>
        )}

        {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.papier },

  corps: { paddingHorizontal: 24, flexGrow: 1, justifyContent: 'center' },

  hero: { alignItems: 'center', marginBottom: 8 },
  slogan: {
    fontFamily: FONTS.display,
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.4,
    color: COLORS.encre,
    textAlign: 'center',
    marginTop: 4,
  },

  actions: { gap: 14, marginTop: 32 },
  groupeSocial: { gap: 10 },
  separateur: { height: 1, backgroundColor: COLORS.ligne },
  avatarEmail: { width: 20, height: 20, borderRadius: 10 },

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

  noteSys: {
    flexDirection: 'row',
    gap: 11,
    padding: 13,
    marginTop: 32,
    backgroundColor: COLORS.tracePale,
    borderRadius: RADIUS.m,
  },
  noteSysTexte: { flex: 1, fontFamily: FONTS.texte, fontSize: 12.5, lineHeight: 18, color: COLORS.encre2 },

  erreur: { fontFamily: FONTS.texte, fontSize: 13, color: COLORS.alerte, textAlign: 'center', marginTop: 14 },

  titre: {
    fontFamily: FONTS.display,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.5,
    color: COLORS.encre,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
});
