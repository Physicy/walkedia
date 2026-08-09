// Couleur de heatmap pour un tronçon selon son nombre de passages :
// blanc -> jaune -> rouge, plafonné à 100 passages. 0 passage -> pas de
// couleur spéciale (le tronçon garde son style "non découvert").

const WHITE: [number, number, number] = [255, 255, 255];
const YELLOW: [number, number, number] = [250, 204, 21];
const RED: [number, number, number] = [220, 38, 38];

function mix(a: [number, number, number], b: [number, number, number], f: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function heatColor(count: number): string | null {
  if (!count || count <= 0) return null;
  const t = Math.min(1, count / 100);
  const [r, g, b] = t < 0.5 ? mix(WHITE, YELLOW, t / 0.5) : mix(YELLOW, RED, (t - 0.5) / 0.5);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

// Gris (rien de complété) -> bleu (tout complété) : couleur des ondes de
// capture individuelles ET des badges de cluster (LOD par zoom), pour rester
// cohérent visuellement d'un niveau de zoom à l'autre.
const WAVE_GRAY: [number, number, number] = [148, 163, 184];
const WAVE_BLUE: [number, number, number] = [59, 130, 246];

export function progressColor(ratio: number): string {
  const [r, g, b] = mix(WAVE_GRAY, WAVE_BLUE, Math.max(0, Math.min(1, ratio)));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
