// Système encre et papier (walkedia_design_v2).
//
// Le pari du design : une app de carte se regarde dehors, en plein jour, par
// dessus des tuiles claires. Le bleu nuit d'origine opposait un HUD sombre à
// une carte claire ; l'encre sur papier supprime ce contraste.
//
// Règle unique de l'accent : le violet ne désigne QUE de la géométrie
// parcourue ou un point gagné. Jamais un fond de bouton, jamais une décoration.
// C'est ce qui le garde lisible. Les boutons sont en encre.

export const COLORS = {
  // encre : le texte et les surfaces sombres
  encre: '#1A1B2E',
  encre2: '#4D4F68',
  encre3: '#8A8CA3',

  // papier : le fond du document et les surfaces claires
  papier: '#E8E7EE',
  surface: '#FBFAFD',

  // la trace : le seul accent
  trace: '#6C5DF4',
  traceFonce: '#4C3ED8',
  traceClair: '#A79BFF', // le violet lisible sur fond encre
  tracePale: 'rgba(108, 93, 244, 0.13)',

  // l'unique exception à la règle du violet : la série de jours consécutifs,
  // au profil (voir components/PixelFlame.tsx). Un orange doux, jamais
  // réutilisé ailleurs pour rester une exception repérable.
  flamme: '#E2894A',
  flammePale: 'rgba(226, 137, 74, 0.14)',

  ligne: 'rgba(26, 27, 46, 0.13)',
  ligneForte: 'rgba(26, 27, 46, 0.28)',

  // réservé à ce qui détruit des données
  alerte: '#BE4B3C',

  // couleurs de la carte elle-même, pas de l'interface
  rue: '#F7F6FA',
  ilot: '#DFDDE8',
  vegetal: '#C4D2B8',

  // --- Noms hérités du thème bleu nuit ---------------------------------
  // Remappés sur le nouveau système plutôt que supprimés : la refonte se fait
  // écran par écran, et sans ces alias les écrans pas encore repris
  // afficheraient du texte clair sur fond clair entre deux commits.
  bg: '#E8E7EE',
  bgAlt: '#E8E7EE',
  panel: 'rgba(251, 250, 253, 0.94)',
  border: 'rgba(26, 27, 46, 0.13)',
  text: '#1A1B2E',
  textMuted: '#4D4F68',
  textDim: '#8A8CA3',
  primary: '#1A1B2E', // les boutons sont en encre, pas en violet
  accentViolet: '#6C5DF4',
  accentCyan: '#6C5DF4',
  accentGreen: '#6C5DF4',
  accentAmber: '#BE4B3C',
  recording: '#BE4B3C',

  undiscovered: 'rgba(26, 27, 46, 0.30)',
  discovered: '#6C5DF4',
  incomplete: '#8A8CA3',
  complete: '#6C5DF4',
  track: '#6C5DF4',
  position: '#6C5DF4',
};

// Rayons du système.
export const RADIUS = { s: 10, m: 16, l: 22 };

// Couleurs de trace sélectionnables (voir logic/prefs.ts, traceColor) : le
// violet reste le premier choix / la couleur par défaut, les autres teintes
// choisies pour rester lisibles aussi bien en trait sur `papier` qu'en fond
// de pastille sur `encre`, et suffisamment éloignées d'`alerte` (#BE4B3C)
// pour ne jamais se confondre avec un état d'erreur.
export const TRACE_PALETTE = [
  '#6C5DF4', // violet (défaut)
  '#2563EB', // bleu
  '#0D9488', // sarcelle
  '#4D8C2B', // vert
  '#E2711D', // orange
  '#C0388B', // rose
];

// Familles chargées au démarrage (voir useAppFonts).
//
// Le design appelle Archivo avec un axe de largeur (`wdth` 112 à 125). Les
// paquets @expo-google-fonts ne livrent que des poids statiques et React
// Native n'expose pas les axes variables : les titres sont donc en Archivo
// ExtraBold de largeur normale. C'est le seul écart assumé avec la maquette.
export const FONTS = {
  display: 'Archivo_800ExtraBold',
  displaySemi: 'Archivo_700Bold',
  texte: 'InstrumentSans_400Regular',
  texteMedium: 'InstrumentSans_500Medium',
  texteSemi: 'InstrumentSans_600SemiBold',
  texteBold: 'InstrumentSans_700Bold',
  mono: 'MartianMono_400Regular',
  monoMedium: 'MartianMono_500Medium',
  monoSemi: 'MartianMono_600SemiBold',
};
