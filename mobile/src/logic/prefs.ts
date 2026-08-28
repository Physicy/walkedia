// Préférences locales, séparées de la progression (storage.ts) : ce sont des
// repères d'interface qui n'ont pas à voyager avec le compte Supabase.
//
// Ils sont persistés plutôt que gardés en mémoire parce que le parcours de
// première ouverture s'étale sur plusieurs étapes bloquantes (connexion,
// permission système, premier calcul de zone), soit largement de quoi fermer
// l'app en chemin et devoir tout resubir au retour.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'walkedia-prefs-v1';

export interface Prefs {
  // le parcours de première ouverture a été vu jusqu'au bout
  onboarded: boolean;
  // le repère qui pointe le premier point à décrocher a été refermé
  repereVu: boolean;
  // coupe la session automatiquement au-dessus de 20 km/h (voir useWalkedia.ts,
  // SPEED_LIMIT_KMH) — activé par défaut, réglable depuis Réglages pour qui
  // marche vite en descente et se fait couper à tort.
  arretAutoVitesse: boolean;
  // couleur d'accent choisie par le joueur (voir theme.ts, TRACE_PALETTE) :
  // remplace le violet fixe pour le halo autour des carrefours, les points
  // déjà validés et le tracé de la session en cours. Un hex, pas un index de
  // palette : reste valide même si la palette change plus tard.
  traceColor: string;
  // avatar choisi (voir logic/avatars.ts) — null tant que rien n'est
  // sélectionné, le profil retombe alors sur les initiales (Jeton, ui.tsx).
  avatarId: string | null;
  // objectif de pas quotidien (voir logic/streak.ts, computeStreak) — pas de
  // 500, borné 1000-30000 comme la maquette.
  dailyStepGoal: number;
  // rappel d'objectif + notification de point débloqué (voir logic/notifications.ts).
  notificationsEnabled: boolean;
  // miroir local de profiles.hide_stats (Supabase) : affichage immédiat de
  // l'interrupteur sans attendre l'aller-retour réseau (voir useAuth.ts,
  // setHideStats). La valeur qui compte reste celle du serveur, relue à la
  // connexion — ce miroir n'est qu'un cache d'affichage.
  hideStats: boolean;
  // apparence de la carte (voir SettingsScreen.tsx, modale "carte") — pas
  // encore lu par MapScreen.tsx, seulement persisté pour l'instant.
  mapLayer: 'trace' | 'chaleur' | 'quartiers';
  mapBackground: 'clair' | 'plan';
}

const DEFAULTS: Prefs = {
  onboarded: false,
  repereVu: false,
  arretAutoVitesse: true,
  traceColor: '#6C5DF4',
  avatarId: null,
  dailyStepGoal: 7000,
  notificationsEnabled: true,
  hideStats: false,
  mapLayer: 'trace',
  mapBackground: 'clair',
};

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function savePrefs(prefs: Partial<Prefs>): Promise<void> {
  const current = await loadPrefs();
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...current, ...prefs }));
}
