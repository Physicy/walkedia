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

// Gris (rien de complété) -> bleu (tout complété) : couleur des ondes de
// capture individuelles ET des badges de cluster (LOD par zoom), pour rester
// cohérent visuellement d'un niveau de zoom à l'autre.
const WAVE_GRAY: [number, number, number] = [148, 163, 184];
const WAVE_BLUE: [number, number, number] = [59, 130, 246];

export function progressColor(ratio: number): string {
  const [r, g, b] = mix(WAVE_GRAY, WAVE_BLUE, Math.max(0, Math.min(1, ratio)));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
