// Flamme pixel art de la série en cours (voir logic/streak.ts, ProfileScreen.tsx) :
// cinq paliers dessinés à la main plutôt qu'une proportion continue, pour que
// la flambée s'embrase par à-coups sensibles (3, 7, 14, 30 jours) au lieu de
// grossir en continu de façon illisible sur une icône aussi petite.
//
// `.` case vide, `o` flamme (COLORS.flamme), `y` cœur chaud (teinte plus
// claire de la même famille — jamais une couleur système à part entière).
import React from 'react';
import Svg, { Rect } from 'react-native-svg';
import { COLORS } from '../theme';

const LARGEUR = 7;
const HAUTEUR = 9;
const COEUR = '#F6C687';

const PALIERS: string[][] = [
  // 0 — braise
  ['.......', '.......', '.......', '.......', '.......', '.......', '.......', '...o...', '..oyo..'],
  // 1 — démarre
  ['.......', '.......', '.......', '.......', '.......', '..ooo..', '.ooooo.', '.ooyoo.', '..ooo..'],
  // 2 — belle flambée
  ['.......', '.......', '...o...', '..ooo..', '.ooooo.', 'ooooyoo', '.ooyoo.', '.ooooo.', '..ooo..'],
  // 3 — chaude
  ['.......', '...o...', '..ooo..', '.ooyoo.', 'oooyooo', 'ooyyyoo', '.ooyoo.', '.ooooo.', 'ooooooo'],
  // 4 — ardente
  ['...o...', '..ooo..', '.ooyoo.', 'ooyyyoo', 'oyyyyyo', 'ooyyyoo', '.ooyoo.', 'ooooooo', 'ooooooo'],
];

export function PixelFlame({ stage, size = 22 }: { stage: number; size?: number }) {
  const grille = PALIERS[Math.max(0, Math.min(PALIERS.length - 1, stage))];
  return (
    <Svg width={size} height={(size * HAUTEUR) / LARGEUR} viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}>
      {grille.flatMap((ligne, y) =>
        ligne.split('').map((c, x) =>
          c === '.' ? null : <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c === 'y' ? COEUR : COLORS.flamme} />
        )
      )}
    </Svg>
  );
}
