// Séries de l'activité du profil (voir ProfileScreen.tsx), pour les trois
// métriques et les quatre périodes du sélecteur "Ton activité". Semaine en
// jours, mois en semaines (le mois entier ferait trop de barres pour tenir à
// l'écran), année en mois — même granularité que les apps de fitness usuelles.
import type { Progress } from './storage';
import { stepsOnDay, type StepsLog } from './stepsLog';

const DAY = 86400000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(ms: number): number {
  const d = new Date(ms);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  const jour = (d.getDay() + 6) % 7; // 0 = lundi
  d.setDate(d.getDate() - jour);
  return d.getTime();
}

function addMonths(ms: number, n: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
}

export type ActivityPeriod = 'week' | 'month' | 'lastMonth' | 'year';
export type ActivityMetric = 'junctions' | 'segments' | 'steps';

interface Plage {
  start: number;
  end: number;
  label: string;
}

function plagesPeriode(period: ActivityPeriod, locale: string): Plage[] {
  const now = Date.now();
  const jourCourt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const dateCourte = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' });
  const moisCourt = new Intl.DateTimeFormat(locale, { month: 'short' });

  if (period === 'week') {
    const auj = startOfDay(now);
    const out: Plage[] = [];
    for (let i = 6; i >= 0; i--) {
      const start = auj - i * DAY;
      out.push({ start, end: start + DAY, label: jourCourt.format(new Date(start)).replace('.', '') });
    }
    return out;
  }

  if (period === 'month' || period === 'lastMonth') {
    const debutMois = period === 'month' ? startOfMonth(now) : addMonths(startOfMonth(now), -1);
    const finMois = period === 'month' ? startOfDay(now) + DAY : startOfMonth(now);
    const out: Plage[] = [];
    let curseur = startOfWeek(debutMois);
    while (curseur < finMois) {
      const start = Math.max(curseur, debutMois);
      const end = Math.min(curseur + 7 * DAY, finMois);
      out.push({ start, end, label: dateCourte.format(new Date(start)) });
      curseur += 7 * DAY;
    }
    return out;
  }

  // year : de janvier au mois courant, jamais dans le futur
  const debutAnnee = startOfMonth(new Date(now).setMonth(0, 1));
  const moisCourant = new Date(now).getMonth();
  const out: Plage[] = [];
  for (let m = 0; m <= moisCourant; m++) {
    const start = addMonths(debutAnnee, m);
    out.push({ start, end: addMonths(debutAnnee, m + 1), label: moisCourt.format(new Date(start)).replace('.', '') });
  }
  return out;
}

export interface ActivityBucket {
  label: string;
  value: number;
}

export interface ActivitySeries {
  buckets: ActivityBucket[];
  total: number;
}

export function activitySeries(
  progress: Progress,
  stepsLog: StepsLog,
  period: ActivityPeriod,
  metric: ActivityMetric,
  locale: string
): ActivitySeries {
  const plages = plagesPeriode(period, locale);

  function valeur(p: Plage): number {
    if (metric === 'junctions') {
      let n = 0;
      for (const at of Object.values(progress.completedAt)) if (at >= p.start && at < p.end) n++;
      return n;
    }
    if (metric === 'segments') {
      let n = 0;
      for (const s of progress.sessions) if (s.start >= p.start && s.start < p.end) n += s.edges;
      return n;
    }
    // pas : cumul jour par jour du journal local (voir stepsLog.ts) — vide
    // avant l'ajout de cette fonctionnalité, comme n'importe quel nouveau
    // compteur.
    let n = 0;
    for (let t = p.start; t < p.end; t += DAY) n += stepsOnDay(stepsLog, t);
    return n;
  }

  const buckets = plages.map((p) => ({ label: p.label, value: valeur(p) }));
  return { buckets, total: buckets.reduce((s, b) => s + b.value, 0) };
}
