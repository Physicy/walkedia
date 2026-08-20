// Couleur d'un tronçon découvert, selon son nombre de passages :
// vert -> jaune -> rouge. 0 passage -> pas de couleur (le tronçon garde son
// style "non découvert").
//
// L'échelle commençait au BLANC, ce qui rendait tout tronçon parcouru une
// seule fois invisible sur le fond de carte OSM, dont les rues sont blanches.
// Comme le rendu passe toujours par cette fonction pour un tronçon découvert
// (`edgeVisits[id] ?? 1`, donc jamais 0), le vert prévu par MapScreen n'était
// jamais atteint : en pratique, aucun chemin emprunté ne se voyait.
// Le vert est donc devenu le point de départ de l'échelle, ce qui réunit les
// deux besoins — « ce que j'ai parcouru » se lit d'un coup d'œil, et les
// passages répétés continuent de chauffer.

const GREEN: [number, number, number] = [34, 197, 94];
const YELLOW: [number, number, number] = [250, 204, 21];
const RED: [number, number, number] = [220, 38, 38];

// Nombre de passages à partir duquel un tronçon est "au maximum". L'ancien
// plafond de 100 était hors d'échelle : `edgeVisits` n'augmente qu'une fois
// par arête et par session (voir Matcher.traversed), donc un trajet quotidien
// met des mois à s'en approcher — tout restait collé au bas de l'échelle.
const HOT_AT = 20;

function mix(a: [number, number, number], b: [number, number, number], f: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function heatColor(count: number): string | null {
  if (!count || count <= 0) return null;
  // Progression logarithmique : les premiers passages répétés (2, 3, 4…) sont
  // ceux qui distinguent un trajet habituel d'une découverte unique, et une
  // rampe linéaire les rendrait indiscernables.
  const t = Math.min(1, Math.log(count) / Math.log(HOT_AT));
  const [r, g, b] = t < 0.5 ? mix(GREEN, YELLOW, t / 0.5) : mix(YELLOW, RED, (t - 0.5) / 0.5);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

// Gris (rien de complété) -> violet (tout complété) : couleur des ondes de
// capture individuelles ET des badges de cluster (LOD par zoom). Le violet ne
// désigne que de la géométrie parcourue ou un point gagné (règle du système
// encre et papier) — un ratio de complétion en fait partie, contrairement à
// heatColor ci-dessus qui reste sur sa propre échelle (fréquence de passage,
// pas possession).
const WAVE_GRAY: [number, number, number] = [138, 140, 163];
const WAVE_VIOLET: [number, number, number] = [108, 93, 244];

export function progressColor(ratio: number): string {
  const [r, g, b] = mix(WAVE_GRAY, WAVE_VIOLET, Math.max(0, Math.min(1, ratio)));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const NOIR: [number, number, number] = [26, 27, 46]; // COLORS.encre, pour foncer
const BLANC: [number, number, number] = [251, 250, 253]; // COLORS.surface, pour éclaircir

// Dérive les trois nuances qu'un accent de trace a besoin (foncée pour la
// bordure d'un point complet, claire pour une trace en surimpression sur
// fond sombre, pâle pour un fond de bandeau) depuis une seule couleur choisie
// par le joueur — le système n'avait qu'une seule couleur de trace en dur
// (theme.ts), ces trois-là étaient calées à la main sur elle.
export interface NuancesTrace {
  base: string;
  fonce: string;
  clair: string;
  pale: string; // rgba, pour un fond
}

// Pour un besoin ponctuel (halo de précision GPS, fond de bandeau à une
// opacité précise) plutôt que d'ajouter un champ à NuancesTrace par usage.
export function rgbaTrace(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function nuancesTrace(hex: string): NuancesTrace {
  const rgb = hexToRgb(hex);
  const foncePct = mix(rgb, NOIR, 0.28);
  const clairPct = mix(rgb, BLANC, 0.35);
  return {
    base: hex,
    fonce: rgbToHex(foncePct),
    clair: rgbToHex(clairPct),
    pale: `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, 0.13)`,
  };
}
