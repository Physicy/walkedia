import type { Progress } from './storage';

const DAY = 86400000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Paliers d'intensité de la flambée (voir components/PixelFlame.tsx, qui
// s'embrase par paliers plutôt que proportionnellement au nombre exact de
// jours) et libellé associé (voir i18n, clés profile.streakTier*).
const PALIERS = [
  { min: 30, tier: 'ardente', stage: 4 },
  { min: 14, tier: 'chaude', stage: 3 },
  { min: 7, tier: 'belle', stage: 2 },
  { min: 3, tier: 'demarre', stage: 1 },
  { min: 1, tier: 'debut', stage: 0 },
] as const;

export type StreakTier = (typeof PALIERS)[number]['tier'] | 'aucune';

export interface StreakInfo {
  jours: number;
  tier: StreakTier;
  stage: number; // 0 à 4, pour PixelFlame
}

// Compte les jours consécutifs avec au moins un carrefour complété, en
// remontant depuis aujourd'hui. Un jour sans complétion aujourd'hui ne casse
// pas encore la série (elle reste "en cours" jusqu'à minuit) : on démarre le
// compte à hier dans ce cas, comme les compteurs de série habituels.
export function currentStreak(progress: Progress): StreakInfo {
  const jours = new Set<number>();
  for (const at of Object.values(progress.completedAt)) jours.add(startOfDay(at));

  const aujourdhui = startOfDay(Date.now());
  let curseur = jours.has(aujourdhui) ? aujourdhui : aujourdhui - DAY;

  let n = 0;
  while (jours.has(curseur)) {
    n++;
    curseur -= DAY;
  }

  const palier = PALIERS.find((p) => n >= p.min);
  return { jours: n, tier: palier ? palier.tier : 'aucune', stage: palier ? palier.stage : 0 };
}
