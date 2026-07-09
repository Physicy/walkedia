// Persistance locale de la progression (localStorage).
// L'historique d'arêtes et les intersections complétées sont globaux : ils
// survivent aux changements de zone chargée.

const KEY = 'walkedia-v1';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw);
    return {
      edges: new Set(data.edges || []),
      intersections: new Set(data.intersections || []),
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
      intersections: [...state.intersections],
      savedAt: new Date().toISOString(),
    })
  );
}

function fresh() {
  return { edges: new Set(), intersections: new Set() };
}
