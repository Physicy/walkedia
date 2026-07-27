// Persistance locale de la progression (AsyncStorage).
// L'historique d'arêtes et les carrefours complétés sont globaux : ils
// survivent aux changements de zone chargée.
// `completedAt` date chaque complétion (ms epoch) pour les statistiques du
// profil ; les carrefours complétés avant l'ajout du suivi temporel restent
// dans `junctions` sans date (comptés dans le total uniquement).

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'walkedia-v1';
const MAX_SESSIONS = 100;

export interface Session {
  start: number;
  end: number;
  edges: number;
  junctions: number;
  imported?: boolean;
}

export interface Progress {
  edges: Set<string>;
  junctions: Set<string>;
  completedAt: Record<string, number>;
  edgeMeters: number;
  sessions: Session[];
}

export async function load(): Promise<Progress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw);
    return {
      edges: new Set(data.edges || []),
      junctions: new Set(data.junctions || []),
      completedAt: data.completedAt || {}, // junctionId -> ms epoch
      edgeMeters: data.edgeMeters || 0, // distance découverte cumulée (m)
      sessions: data.sessions || [], // { start, end, edges, junctions }
    };
  } catch {
    return fresh();
  }
}

export async function save(state: Progress): Promise<void> {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      edges: [...state.edges],
      junctions: [...state.junctions],
      completedAt: state.completedAt,
      edgeMeters: Math.round(state.edgeMeters),
      sessions: state.sessions.slice(-MAX_SESSIONS),
      savedAt: new Date().toISOString(),
    })
  );
}

function fresh(): Progress {
  return { edges: new Set(), junctions: new Set(), completedAt: {}, edgeMeters: 0, sessions: [] };
}
