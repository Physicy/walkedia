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
  // la connexion a déjà été proposée une fois. Elle ne l'est plus d'elle-même
  // ensuite : c'est une offre, pas une porte, et la reposer à chaque ouverture
  // la transformerait en porte qu'on contourne.
  connexionProposee: boolean;
  // coupe la session automatiquement au-dessus de 20 km/h (voir useWalkedia.ts,
  // SPEED_LIMIT_KMH) — activé par défaut, réglable depuis Réglages pour qui
  // marche vite en descente et se fait couper à tort.
  arretAutoVitesse: boolean;
}

const DEFAULTS: Prefs = { onboarded: false, repereVu: false, connexionProposee: false, arretAutoVitesse: true };

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
