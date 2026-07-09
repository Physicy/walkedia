// Persistance locale de la progression (localStorage).
// L'historique d'arêtes et les carrefours complétés sont globaux : ils
// survivent aux changements de zone chargée.
// Le champ `junctions` remplace l'ancien `intersections` (nœuds bruts) depuis
// la consolidation des carrefours ; les complétions sont recalculées depuis
// l'historique d'arêtes, qui est la seule donnée source.

const KEY = 'walkedia-v1';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw);
    return {
      edges: new Set(data.edges || []),
      junctions: new Set(data.junctions || []),
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
      savedAt: new Date().toISOString(),
    })
  );
}

function fresh() {
  return { edges: new Set(), junctions: new Set() };
}
