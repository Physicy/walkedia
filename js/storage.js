// Persistance locale de la progression (localStorage).
// L'historique d'arêtes et les carrefours complétés sont globaux : ils
// survivent aux changements de zone chargée.
// `completedAt` date chaque complétion (ms epoch) pour les statistiques du
// profil ; les carrefours complétés avant l'ajout du suivi temporel restent
// dans `junctions` sans date (comptés dans le total uniquement).

const KEY = 'walkedia-v1';
const MAX_SESSIONS = 100;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw);
    return {
      edges: new Set(data.edges || []),
      junctions: new Set(data.junctions || []),
      completedAt: data.completedAt || {}, // junctionId -> ms epoch
      edgeMeters: data.edgeMeters || 0,    // distance découverte cumulée (m)
      sessions: data.sessions || [],       // { start, end, edges, junctions }
    };
  } catch {
    return fresh();
  }
}

export function save(state) {
  localStorage.setItem(
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

function fresh() {
  return { edges: new Set(), junctions: new Set(), completedAt: {}, edgeMeters: 0, sessions: [] };
}
