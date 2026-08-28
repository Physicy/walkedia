// Niveau (à partir du total de carrefours) et série de jours consécutifs
// (à partir de l'historique de pas quotidiens) : deux dérivations pures,
// même esprit que color.ts — pas d'état ici, juste des fonctions du total
// actuel vers ce que l'écran affiche.

// Paliers de carrefours par niveau (index = niveau - 1). Repris tels quels
// de la maquette : la progression ralentit volontairement après les
// premiers niveaux, qui se passent en une ou deux sorties.
const SEUILS = [0, 5, 15, 30, 55, 90, 140, 210, 300, 420, 600];

export interface Niveau {
  niveau: number;
  bas: number;
  haut: number;
  pct: number; // 0-100, position dans le palier courant
}

export function computeLevel(carrefours: number): Niveau {
  let niveau = 1;
  for (let i = 0; i < SEUILS.length; i++) {
    if (carrefours >= SEUILS[i]) niveau = i + 1;
  }
  niveau = Math.min(10, niveau);
  const bas = SEUILS[niveau - 1];
  const haut = SEUILS[Math.min(niveau, SEUILS.length - 1)];
  const pct = Math.round(((carrefours - bas) / Math.max(1, haut - bas)) * 100);
  return { niveau, bas, haut, pct };
}

// Clé de jour en heure locale (pas `toISOString`, qui bascule en UTC et
// décalerait la journée près de minuit selon le fuseau du joueur).
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// `history` : date (localDateKey) -> pas comptés ce jour-là. Remonte depuis
// aujourd'hui tant que l'objectif est atteint ; un jour manqué (absent de
// l'historique ou en dessous de l'objectif) arrête le compte. Le jour
// courant ne casse pas la série tant qu'il n'est pas fini (voir
// `todayCounts` dans l'appelant : on ne pénalise jamais une journée encore
// en cours).
export function computeStreak(history: Record<string, number>, goal: number, today: string, todayCounts: boolean): number {
  let streak = 0;
  const d = new Date(today + 'T00:00:00');
  if (todayCounts) {
    if ((history[today] ?? 0) >= goal) streak++;
    else return 0;
  }
  d.setDate(d.getDate() - 1);
  for (;;) {
    const key = localDateKey(d);
    if ((history[key] ?? 0) < goal) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export type PalierFeu = 'eteint' | 'etincelle' | 'ca-prend' | 'flambee' | 'brasier';

// Paliers de la maquette : 0/1/3/7/14 jours.
export function fireStage(streak: number): PalierFeu {
  if (streak >= 14) return 'brasier';
  if (streak >= 7) return 'flambee';
  if (streak >= 3) return 'ca-prend';
  if (streak >= 1) return 'etincelle';
  return 'eteint';
}
