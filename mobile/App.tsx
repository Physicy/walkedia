import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useWalkedia, neighborhoodStats } from './src/hooks/useWalkedia';
import { useAuth } from './src/hooks/useAuth';
import { useAppFonts } from './src/fonts';
import { loadPrefs, savePrefs } from './src/logic/prefs';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { StartScreen } from './src/screens/StartScreen';
import { MapScreen } from './src/screens/MapScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TabBar, TabName } from './src/components/TabBar';
import { COLORS } from './src/theme';

function AppContent() {
  const walkedia = useWalkedia();
  const { state, actions } = walkedia;
  const auth = useAuth();
  const policesPretes = useAppFonts();
  const [tab, setTab] = useState<TabName>('adventure');

  // Repère de première ouverture, persisté (prefs.ts) et pas gardé dans un
  // ref : entre la fin de l'onboarding et la première carte il y a la
  // connexion, la permission et le calcul de la zone, soit largement de quoi
  // fermer l'app en chemin.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    loadPrefs().then((p) => setOnboarded(p.onboarded));
  }, []);

  // `autoriser` répond au bouton du dernier écran d'onboarding. La demande
  // système n'est pas déclenchée ici : la connexion s'intercale encore avant la
  // carte, et une boîte de permission posée derrière l'écran de connexion
  // arriverait hors contexte. On retient seulement le choix, que la mise en
  // route automatique ci-dessous consulte une fois la session ouverte.
  // Refuser n'a rien de définitif : l'écran de démarrage garde son bouton.
  const [positionDifferee, setPositionDifferee] = useState(false);
  const finishOnboarding = (autoriser: boolean) => {
    setOnboarded(true);
    setPositionDifferee(!autoriser);
    savePrefs({ onboarded: true });
  };

  // Connecte l'état d'auth (Supabase, indépendant du reste de l'app — voir
  // useAuth.ts) au hook de jeu : à la connexion, fusionne/synchronise la
  // progression distante ; à la déconnexion, repasse en local uniquement
  // (la progression locale reste intacte, juste plus poussée vers le compte).
  const lastUserId = useRef<string | null>(null);
  useEffect(() => {
    const uid = auth.user?.id ?? null;
    if (uid === lastUserId.current) return;
    lastUserId.current = uid;
    if (uid) actions.syncOnSignIn(uid);
    else actions.signOutLocally();
  }, [auth.user, actions]);

  // Va directement à la carte à l'ouverture : dès que la progression est
  // chargée, on déclenche la géolocalisation sans attendre un appui sur un
  // bouton. Le bouton de l'écran de démarrage reste affiché pendant le
  // chargement et sert de nouvelle tentative manuelle en cas d'échec (refus
  // de permission, position indisponible…). Ne démarre qu'une fois connecté :
  // voir la porte d'authentification ci-dessous.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (positionDifferee) return;
    if (auth.user && state.ready && !state.mapReady && !autoStarted.current) {
      autoStarted.current = true;
      actions.requestLocationAndInit();
    }
  }, [auth.user, state.ready, state.mapReady, actions, positionDifferee]);

  // L'onboarding passe avant la connexion : demander un compte à quelqu'un qui
  // ne sait pas encore à quoi sert l'app est la meilleure façon de le perdre.
  if (onboarded === false) {
    return (
      <View style={styles.fill}>
        <OnboardingScreen onDone={finishOnboarding} />
        <StatusBar style="dark" />
      </View>
    );
  }

  // Porte d'authentification : rien d'autre (carte, recherche, profil) ne
  // s'affiche tant qu'il n'y a pas de session Supabase. Passe avant l'état
  // de chargement de la progression locale, qui continue en tâche de fond.
  if (onboarded === null || !policesPretes || auth.loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.trace} />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!auth.user) {
    return (
      <View style={styles.fill}>
        <LoginScreen auth={auth} />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!state.ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.trace} />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!state.mapReady) {
    return (
      <View style={styles.fill}>
        <StartScreen status={state.startStatus} onLocate={actions.requestLocationAndInit} />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <MapScreen walkedia={walkedia} />
      {tab === 'search' && <SearchScreen userId={auth.user?.id ?? null} />}
      {tab === 'profile' && (
        <ProfileScreen
          progress={state.progress}
          auth={auth}
          syncing={state.syncing}
          neighborhoods={neighborhoodStats(state)}
          backgroundTrackingEnabled={state.backgroundTrackingEnabled}
          onToggleBackgroundTracking={(next) =>
            next ? actions.enableBackgroundTracking() : actions.disableBackgroundTracking()
          }
        />
      )}
      <TabBar active={tab} onChange={setTab} />
      <StatusBar style="dark" />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
});
