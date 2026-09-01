import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadSavedLanguage } from './src/i18n';
import { useWalkedia, neighborhoodStats } from './src/hooks/useWalkedia';
import { useAuth } from './src/hooks/useAuth';
import { usePedometer } from './src/hooks/usePedometer';
import { useAppFonts } from './src/fonts';
import { loadPrefs, savePrefs } from './src/logic/prefs';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { StartScreen } from './src/screens/StartScreen';
import { MapScreen } from './src/screens/MapScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ProfileActivityScreen } from './src/screens/ProfileActivityScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { FusionVoile } from './src/components/FusionVoile';
import { TabBar, TabName } from './src/components/TabBar';
import { COLORS } from './src/theme';

loadSavedLanguage();

function AppContent() {
  const walkedia = useWalkedia();
  const { state, actions } = walkedia;
  const auth = useAuth();
  const pedometer = usePedometer();
  const policesPretes = useAppFonts();
  const [tab, setTab] = useState<TabName>('adventure');
  const [reglagesOuverts, setReglagesOuverts] = useState(false);
  const [activiteOuverte, setActiviteOuverte] = useState(false);

  // Repère de première ouverture, persisté (prefs.ts) et pas gardé dans un
  // ref : entre la fin de l'onboarding et la première carte il y a la
  // connexion, la permission et le calcul de la zone, soit largement de quoi
  // fermer l'app en chemin.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    loadPrefs().then((p) => {
      setOnboarded(p.onboarded);
    });
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
  // bouton. L'écran de démarrage garde son bouton de nouvelle tentative en cas
  // d'échec (refus de permission, position indisponible…).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (positionDifferee || onboarded !== true) return;
    if (state.ready && !state.mapReady && !autoStarted.current) {
      autoStarted.current = true;
      actions.requestLocationAndInit();
    }
  }, [state.ready, state.mapReady, actions, positionDifferee, onboarded]);

  // Demande la permission de comptage de pas une seule fois, dès que l'app
  // principale s'affiche (le relevé de pas est un contenu permanent du
  // Profil, pas une fonctionnalité optionnelle activée à la demande — à la
  // différence des notifications, qui restent gated derrière leur
  // interrupteur dans Réglages).
  const pedometerAsked = useRef(false);
  useEffect(() => {
    if (state.mapReady && !pedometerAsked.current) {
      pedometerAsked.current = true;
      pedometer.demanderPermission();
    }
  }, [state.mapReady, pedometer]);

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

  // Attente des trois choses sans lesquelles le premier écran serait faux : les
  // préférences (sait-on s'il faut l'onboarding ?), les polices (sinon le titre
  // s'affiche en police système puis saute), et l'état de session (sinon la
  // connexion s'affiche à quelqu'un qui est déjà connecté). Le chargement de
  // la progression locale, lui, continue en tâche de fond.
  if (onboarded === null || !policesPretes || auth.loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.trace} />
        <StatusBar style="dark" />
      </View>
    );
  }

  // Porte d'authentification : rien d'autre (carte, recherche, profil) ne
  // s'affiche tant qu'il n'y a pas de session Supabase. La progression vit en
  // local (storage.ts) une fois connecté — le compte ne fait que la
  // transporter d'un téléphone à l'autre.
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
        {state.fusionResume && <FusionVoile resume={state.fusionResume} onFermer={actions.dismissFusionResume} />}
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!state.mapReady) {
    return (
      <View style={styles.fill}>
        <StartScreen
          status={state.startStatus}
          kind={state.startStatusKind}
          onLocate={actions.requestLocationAndInit}
        />
        {state.fusionResume && <FusionVoile resume={state.fusionResume} onFermer={actions.dismissFusionResume} />}
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
          onOuvrirReglages={() => setReglagesOuverts(true)}
          onOuvrirActivite={() => setActiviteOuverte(true)}
          traceColor={state.traceColor}
          onChoisirCouleur={actions.setTraceColor}
          avatarId={state.avatarId}
          onChoisirAvatar={actions.setAvatar}
          dailyStepGoal={state.dailyStepGoal}
          onSetDailyGoal={actions.setDailyGoal}
          stepsToday={pedometer.stepsToday}
          stepsHistory={pedometer.history}
          hideStats={state.hideStats}
          neighborhoodsCount={neighborhoodStats(state).length}
        />
      )}
      <TabBar active={tab} onChange={setTab} />

      {activiteOuverte && (
        <ProfileActivityScreen
          progress={state.progress}
          neighborhoods={neighborhoodStats(state)}
          onFermer={() => setActiviteOuverte(false)}
        />
      )}

      {reglagesOuverts && (
        <SettingsScreen
          auth={auth}
          backgroundTrackingEnabled={state.backgroundTrackingEnabled}
          onToggleBackgroundTracking={(next) =>
            next ? actions.enableBackgroundTracking() : actions.disableBackgroundTracking()
          }
          arretAutoVitesse={state.arretAutoVitesse}
          onToggleArretAutoVitesse={actions.setArretAutoVitesse}
          notificationsEnabled={state.notificationsEnabled}
          onToggleNotifications={actions.toggleNotifications}
          hideStats={state.hideStats}
          onToggleHideStats={actions.setHideStats}
          traceColor={state.traceColor}
          onChoisirCouleur={actions.setTraceColor}
          mapLayer={state.mapLayer}
          onChoisirCalque={actions.setMapLayer}
          mapBackground={state.mapBackground}
          onChoisirFond={actions.setMapBackground}
          onWipeProgress={actions.wipeProgress}
          onFermer={() => setReglagesOuverts(false)}
        />
      )}

      {state.fusionResume && <FusionVoile resume={state.fusionResume} onFermer={actions.dismissFusionResume} />}
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
