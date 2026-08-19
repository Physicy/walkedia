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
  // Distance parcourue (km), calculée depuis la trace GPS brute au moment où
  // la session se termine — voir endSession dans useWalkedia.ts. Absente sur
  // les sessions enregistrées avant ce champ, ou reçues d'un autre appareil
  // via la synchronisation (la table distante ne la porte pas) : optionnelle
  // plutôt que 0, pour ne pas laisser croire à une sortie sans un mètre de
  // marche.
  km?: number;
}

export interface Progress {
  edges: Set<string>;
  junctions: Set<string>;
  completedAt: Record<string, number>;
  edgeMeters: number;
  edgeVisits: Record<string, number>;
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
      edgeVisits: data.edgeVisits || {}, // edgeId -> nombre de fois parcouru (pour la heatmap)
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
      edgeVisits: state.edgeVisits,
      sessions: state.sessions.slice(-MAX_SESSIONS),
      savedAt: new Date().toISOString(),
    })
  );
}

function fresh(): Progress {
  return { edges: new Set(), junctions: new Set(), completedAt: {}, edgeMeters: 0, edgeVisits: {}, sessions: [] };
}
