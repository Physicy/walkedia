// Préférences locales, séparées de la progression (storage.ts) : ce sont des
// repères d'interface qui n'ont pas à voyager avec le compte Supabase.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'walkedia-prefs-v1';

export interface Prefs {
  onboarded: boolean;
}

const DEFAULTS: Prefs = { onboarded: false };

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
