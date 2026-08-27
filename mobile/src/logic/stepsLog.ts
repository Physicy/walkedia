// Historique local des pas, jour par jour (voir hooks/usePedometer.ts) :
// Android ne donne aucun accès aux pas passés via expo-sensors (seul un
// compte en direct depuis l'ouverture de l'app), et iOS ne remonte que les
// sept derniers jours. Ce journal comble les deux en enregistrant le total du
// jour au fil de l'eau — il démarre donc vide à l'installation de cette
// fonctionnalité, comme n'importe quel nouveau compteur.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'walkedia-steps-log-v1';
const MAX_JOURS = 400; // un peu plus d'un an, large marge pour la vue "année en cours"

export type StepsLog = Record<string, number>; // "AAAA-MM-JJ" -> pas ce jour-là

function dateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

export async function loadStepsLog(): Promise<StepsLog> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Écrase le total du jour (jamais un cumul) : `steps` est déjà le total du
// jour en cours côté appelant (voir usePedometer.ts).
export async function recordToday(steps: number, at: number = Date.now()): Promise<StepsLog> {
  const log = await loadStepsLog();
  log[dateKey(at)] = steps;

  const clefs = Object.keys(log).sort();
  if (clefs.length > MAX_JOURS) {
    for (const k of clefs.slice(0, clefs.length - MAX_JOURS)) delete log[k];
  }

  await AsyncStorage.setItem(KEY, JSON.stringify(log));
  return log;
}

export function stepsOnDay(log: StepsLog, ms: number): number {
  return log[dateKey(ms)] || 0;
}
