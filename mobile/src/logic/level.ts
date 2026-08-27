// Niveau du joueur, dérivé du seul total qui existe déjà (progress.junctions) :
// pas de nouvelle donnée à faire voyager entre l'appareil et le compte. Le
// coût pour passer au niveau suivant augmente à chaque palier (+10 carrefours
// par niveau franchi) pour que les premiers niveaux tombent vite et les
// suivants demandent une vraie série de sorties.
const PALIER_BASE = 20;
const PALIER_PAS = 10;

// Seuil cumulé de carrefours pour atteindre `level` (le niveau 1 démarre à 0).
function seuil(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += PALIER_BASE + (l - 1) * PALIER_PAS;
  return total;
}

export interface LevelInfo {
  level: number;
  courant: number; // total de carrefours (identique à ProfileScreen, stats.total)
  prochain: number; // seuil cumulé pour le niveau suivant
  fraction: number; // avancement dans le niveau courant, 0 à 1
}

export function levelInfo(total: number): LevelInfo {
  let level = 1;
  while (seuil(level + 1) <= total) level++;
  const bas = seuil(level);
  const haut = seuil(level + 1);
  return {
    level,
    courant: total,
    prochain: haut,
    fraction: haut > bas ? Math.min(1, (total - bas) / (haut - bas)) : 1,
  };
}
