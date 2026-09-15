// Modes d'affichage de la carte de l'écran Aventure : ce qu'il y a SOUS la
// géométrie du jeu, et l'habillage de cette géométrie.
//
// Trois familles de fond :
//  - 'osm'    : les tuiles OpenStreetMap (le « Papier clair » d'origine) ;
//  - 'natif'  : le plan du téléphone (Plans sur iOS, Google Maps sur Android) ;
//  - 'dessin' : aucun fournisseur de tuiles. L'app peint un sol opaque, puis
//               le réseau déjà chargé (les tronçons du graphe) dans les
//               couleurs du mode. C'est ce qui permet les modes parchemin,
//               néon, pixel, aventure et rétro sans clé d'API ni serveur de
//               tuiles, et à l'identique sur les deux plateformes :
//               customMapStyle n'existe que côté Google, userInterfaceStyle
//               que côté Apple, et les fonds raster gratuits (CARTO) exigent
//               désormais une clé.
//
// Limite assumée du dessin : on ne peint que ce que le graphe connaît. Ni
// bâtiments, ni eau, ni noms de rue (get-region ne les sert pas), et hors
// des zones chargées le sol reste nu.
//
// Certains modes ont une « ambiance » : la saison (palette, neige ou
// feuilles) et le moment (palette de nuit, halo autour du joueur), sur
// « auto » par défaut (voir sun.ts pour le jour et la nuit).

import type { Prefs } from './prefs';
import { melangerHex } from './color';
import { hauteurSoleil } from './sun';

export type ModeCarteId = Prefs['mapBackground'];
export type Saison = Exclude<Prefs['mapSeason'], 'auto'>;

export interface PaletteCarte {
  sol: string; // fond opaque, sous tout le reste
  rue: string; // tronçon pas encore relevé, carrossable
  chemin: string; // tronçon pas encore relevé, piéton (en pointillés)
  trace: string | null; // tronçon relevé ; null = la couleur choisie par le joueur
  traceBord: string; // liseré sous la trace, qui la détache du sol
  pointVide: string; // point pas encore atteint
  pointVideBord: string;
  badge: string; // regroupement de points, vue dézoomée
  badgeBord: string;
  badgeTexte: string;
  lumiere: string | null; // halo autour du joueur, la nuit
}

export interface ModeCarte {
  id: ModeCarteId;
  nameKey: string;
  fond: 'osm' | 'natif' | 'dessin';
  ambiance: boolean; // réagit à la saison et au moment
  inclinaison: number; // pitch de la caméra, en degrés
  trame: 'aucune' | 'balayage' | 'lcd'; // texture posée sur la carte, voir MapAmbiance.tsx
}

// Ordre d'affichage dans le sélecteur (voir MapModeSheet.tsx).
export const MODES_CARTE: ModeCarte[] = [
  { id: 'clair', nameKey: 'settings.mapBackgroundLight', fond: 'osm', ambiance: false, inclinaison: 0, trame: 'aucune' },
  { id: 'plan', nameKey: 'settings.mapBackgroundPlan', fond: 'natif', ambiance: false, inclinaison: 0, trame: 'aucune' },
  { id: 'parchemin', nameKey: 'settings.mapModeParchment', fond: 'dessin', ambiance: false, inclinaison: 0, trame: 'aucune' },
  { id: 'neon', nameKey: 'settings.mapModeNeon', fond: 'dessin', ambiance: false, inclinaison: 0, trame: 'aucune' },
  { id: 'pixel', nameKey: 'settings.mapModePixel', fond: 'dessin', ambiance: true, inclinaison: 0, trame: 'balayage' },
  { id: 'aventure', nameKey: 'settings.mapModeAdventure', fond: 'dessin', ambiance: true, inclinaison: 0, trame: 'balayage' },
  // Une vraie projection isométrique n'existe ni dans Plans ni dans Google
  // Maps : c'est la caméra inclinée qui en donne l'effet. 40° plutôt que le
  // maximum : plus on incline, plus la zone visible s'étire vers l'horizon et
  // plus vite la carte bascule en regroupements (voir CLUSTER_LATITUDE_DELTA).
  { id: 'isometrique', nameKey: 'settings.mapModeIsometric', fond: 'dessin', ambiance: true, inclinaison: 40, trame: 'balayage' },
  { id: 'retro', nameKey: 'settings.mapModeRetro', fond: 'dessin', ambiance: false, inclinaison: 0, trame: 'lcd' },
];

const PARCHEMIN: PaletteCarte = {
  sol: '#EADBB2',
  rue: '#F8F1DC',
  chemin: '#D2BD8A',
  trace: '#7A2E22',
  traceBord: '#3F1710',
  pointVide: '#F8F1DC',
  pointVideBord: '#8A7552',
  badge: '#6B4F2E',
  badgeBord: '#3F2C17',
  badgeTexte: '#F8F1DC',
  lumiere: null,
};

const NEON: PaletteCarte = {
  sol: '#1C1936',
  rue: '#3A3372',
  chemin: '#2B2656',
  trace: null,
  traceBord: '#0E0C22',
  pointVide: '#1C1936',
  pointVideBord: '#8C84D6',
  badge: '#2B2656',
  badgeBord: '#8C84D6',
  badgeTexte: '#E4E0FF',
  lumiere: null,
};

const PIXEL_JOUR: PaletteCarte = {
  sol: '#B7B0C8',
  rue: '#F2EDE2',
  chemin: '#DCD6E4',
  trace: null,
  traceBord: '#2A2540',
  pointVide: '#F2EDE2',
  pointVideBord: '#4A4460',
  badge: '#3A3450',
  badgeBord: '#1E1A2E',
  badgeTexte: '#F2EDE2',
  lumiere: null,
};

const PIXEL_NUIT: PaletteCarte = {
  sol: '#2B2840',
  rue: '#5D5779',
  chemin: '#45405E',
  trace: null,
  traceBord: '#0F0D1C',
  pointVide: '#2B2840',
  pointVideBord: '#A39DC0',
  badge: '#1E1B2E',
  badgeBord: '#A39DC0',
  badgeTexte: '#E6E2F5',
  lumiere: 'rgba(255, 196, 112, 0.2)',
};

// Les quatre teintes de l'écran vert des consoles portables d'époque.
const RETRO: PaletteCarte = {
  sol: '#9BBC0F',
  rue: '#8BAC0F',
  chemin: '#306230',
  trace: '#0F380F',
  traceBord: '#306230',
  pointVide: '#9BBC0F',
  pointVideBord: '#0F380F',
  badge: '#306230',
  badgeBord: '#0F380F',
  badgeTexte: '#9BBC0F',
  lumiere: null,
};

// Herbe, sable et terre battue ; roussi en automne, enneigé en hiver.
const AVENTURE: Record<Saison, PaletteCarte> = {
  ete: {
    sol: '#78AE48',
    rue: '#DCC48E',
    chemin: '#B8975A',
    trace: null,
    traceBord: '#3B2A18',
    pointVide: '#F4E8C8',
    pointVideBord: '#5A4028',
    badge: '#5A4028',
    badgeBord: '#2E1F10',
    badgeTexte: '#F4E8C8',
    lumiere: null,
  },
  automne: {
    sol: '#B4863A',
    rue: '#E6CB95',
    chemin: '#8C5E28',
    trace: null,
    traceBord: '#3B2212',
    pointVide: '#F6E6C4',
    pointVideBord: '#6A3A1C',
    badge: '#6A3A1C',
    badgeBord: '#351A0A',
    badgeTexte: '#F6E6C4',
    lumiere: null,
  },
  hiver: {
    sol: '#E9F0F5',
    rue: '#B9C6D3',
    chemin: '#C3CEDA',
    trace: null,
    traceBord: '#2A3442',
    pointVide: '#FFFFFF',
    pointVideBord: '#52627A',
    badge: '#3D4B60',
    badgeBord: '#1F2836',
    badgeTexte: '#FFFFFF',
    lumiere: null,
  },
};

const BLEU_NUIT = '#0B1233';

// Version nocturne d'une palette de jour : tout plonge vers le bleu nuit,
// sauf ce qui doit rester repérable (bords des points et des badges, qui
// s'éclaircissent), et le joueur porte une lanterne.
function versLaNuit(p: PaletteCarte): PaletteCarte {
  const assombrir = (c: string) => melangerHex(c, BLEU_NUIT, 0.58);
  return {
    ...p,
    sol: assombrir(p.sol),
    rue: assombrir(p.rue),
    chemin: assombrir(p.chemin),
    traceBord: melangerHex(p.traceBord, BLEU_NUIT, 0.5),
    pointVide: assombrir(p.pointVide),
    pointVideBord: melangerHex(p.pointVideBord, '#FFFFFF', 0.45),
    badge: assombrir(p.badge),
    badgeBord: melangerHex(p.badgeBord, '#FFFFFF', 0.35),
    lumiere: 'rgba(255, 190, 100, 0.22)',
  };
}

// Calculées une fois : MapScreen résout l'apparence à chaque rendu, et des
// palettes recréées à chaque fois casseraient toute comparaison par référence.
const AVENTURE_NUIT: Record<Saison, PaletteCarte> = {
  ete: versLaNuit(AVENTURE.ete),
  automne: versLaNuit(AVENTURE.automne),
  hiver: versLaNuit(AVENTURE.hiver),
};

// Aperçus des deux fonds que l'app ne peint pas (voir MapModeSheet.tsx) :
// des teintes approchantes pour la vignette, jamais appliquées à la carte.
const APERCU_OSM: PaletteCarte = {
  sol: '#F2EFE9',
  rue: '#FFFFFF',
  chemin: '#E0DCD2',
  trace: null,
  traceBord: '#FFFFFF',
  pointVide: '#FBFAFD',
  pointVideBord: '#8A8CA3',
  badge: '#8A8CA3',
  badgeBord: '#FFFFFF',
  badgeTexte: '#FFFFFF',
  lumiere: null,
};
const APERCU_NATIF: PaletteCarte = { ...APERCU_OSM, sol: '#E4E4E8', chemin: '#D2D2D8' };

// Fin du crépuscule civil : l'éclairage public est allumé.
const NUIT_SOUS_DEGRES = -6;

export interface ApparenceCarte {
  mode: ModeCarte;
  palette: PaletteCarte | null; // null : fond non dessiné (tuiles OSM ou plan natif)
  saison: Saison | null; // null : mode sans ambiance
  nuit: boolean;
  // Change dès que ce qui est peint change. Sert de clé React aux géométries
  // de la carte (voir MapScreen.tsx) pour qu'elles soient remontées APRÈS le
  // sol : sur iOS, l'ordre d'ajout fait l'ordre d'affichage.
  cle: string;
}

export function modeCarte(id: ModeCarteId): ModeCarte {
  return MODES_CARTE.find((m) => m.id === id) ?? MODES_CARTE[0];
}

// Saisons météorologiques (trimestres de mois entiers), décalées de six mois
// dans l'hémisphère sud. Le printemps n'a pas de palette propre : il partage
// celle de l'été.
export function saisonAuto(date: Date, lat: number): Saison {
  let mois = date.getMonth();
  if (lat < 0) mois = (mois + 6) % 12;
  if (mois === 11 || mois <= 1) return 'hiver';
  if (mois >= 8 && mois <= 10) return 'automne';
  return 'ete';
}

function paletteDessin(id: ModeCarteId, saison: Saison, nuit: boolean): PaletteCarte {
  switch (id) {
    case 'parchemin':
      return PARCHEMIN;
    case 'neon':
      return NEON;
    case 'retro':
      return RETRO;
    case 'pixel':
      return nuit ? PIXEL_NUIT : PIXEL_JOUR;
    default:
      return nuit ? AVENTURE_NUIT[saison] : AVENTURE[saison];
  }
}

export function resoudreApparence(
  id: ModeCarteId,
  saisonPref: Prefs['mapSeason'],
  momentPref: Prefs['mapTime'],
  lat: number,
  lon: number,
  date: Date = new Date()
): ApparenceCarte {
  const mode = modeCarte(id);
  if (mode.fond !== 'dessin') return { mode, palette: null, saison: null, nuit: false, cle: mode.id };
  if (!mode.ambiance) return { mode, palette: paletteDessin(mode.id, 'ete', false), saison: null, nuit: false, cle: mode.id };
  const saison = saisonPref === 'auto' ? saisonAuto(date, lat) : saisonPref;
  const nuit = momentPref === 'auto' ? hauteurSoleil(date, lat, lon) < NUIT_SOUS_DEGRES : momentPref === 'nuit';
  return {
    mode,
    palette: paletteDessin(mode.id, saison, nuit),
    saison,
    nuit,
    cle: `${mode.id}-${saison}-${nuit ? 'nuit' : 'jour'}`,
  };
}

export function paletteApercu(id: ModeCarteId): PaletteCarte {
  const mode = modeCarte(id);
  if (mode.fond === 'osm') return APERCU_OSM;
  if (mode.fond === 'natif') return APERCU_NATIF;
  return paletteDessin(mode.id, 'ete', false);
}

// Contour du sol peint : le monde entier plutôt que la zone visible, pour que
// ses coordonnées ne changent JAMAIS. Sur iOS, un polygone dont une prop
// change est retiré puis ré-ajouté par-dessus tous les autres (voir
// AIRMapPolygon.m, update) et zIndex n'y est pas pris en charge : un sol
// recalculé à chaque pan finirait par recouvrir les rues. Un sommet tous les
// 45° de longitude : aucun côté ne dépasse 180°, sinon Google Maps le
// tracerait par le chemin le plus court, de l'autre côté du globe.
export const SOL_MONDE: { latitude: number; longitude: number }[] = (() => {
  const borne = (lon: number) => Math.max(-179.99, Math.min(179.99, lon));
  const points: { latitude: number; longitude: number }[] = [];
  for (let lon = -180; lon <= 180; lon += 45) points.push({ latitude: 85, longitude: borne(lon) });
  for (let lon = 180; lon >= -180; lon -= 45) points.push({ latitude: -85, longitude: borne(lon) });
  return points;
})();
