// Jeu d'icônes du système : tracé au trait, jamais rempli, épaisseur 1.7 à
// 24 px. Elles héritent de la couleur du texte qui les entoure, ce qui évite
// une variante par fond (encre, papier, surface).

import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type NomIcone =
  | 'carte'
  | 'classement'
  | 'profil'
  | 'recentrer'
  | 'calques'
  | 'position'
  | 'positionCoupee'
  | 'carteMuette'
  | 'lecture'
  | 'coche'
  | 'bouclier'
  | 'horloge'
  | 'fermer'
  | 'retour'
  | 'reglages'
  | 'ami'
  | 'crayon';

export function Icone({
  nom,
  size = 24,
  color = '#1A1B2E',
  strokeWidth = 1.7,
}: {
  nom: NomIcone;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const c = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {nom === 'carte' && (
        <>
          <Path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" {...c} />
          <Path d="M9 4v14M15 6v14" {...c} />
        </>
      )}
      {nom === 'classement' && (
        <>
          <Path d="M4 20v-1a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v1" {...c} />
          <Circle cx={9.5} cy={8} r={3.5} {...c} />
          <Path d="M17 11l2 2 3.5-3.5" {...c} />
        </>
      )}
      {nom === 'profil' && (
        <>
          <Path d="M5 4h14v16l-7-3-7 3V4z" {...c} />
          <Path d="M9 9h6M9 13h4" {...c} />
        </>
      )}
      {nom === 'recentrer' && (
        <>
          <Circle cx={12} cy={12} r={7} {...c} />
          <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" {...c} />
        </>
      )}
      {nom === 'calques' && (
        <>
          <Path d="M12 3l9 5-9 5-9-5 9-5z" {...c} />
          <Path d="M3 13l9 5 9-5" {...c} />
        </>
      )}
      {nom === 'position' && (
        <>
          <Path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" {...c} />
          <Circle cx={12} cy={10} r={2.5} {...c} />
        </>
      )}
      {/* position refusée : la punaise, barrée */}
      {nom === 'positionCoupee' && (
        <>
          <Path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" {...c} />
          <Path d="M5 5l14 14" {...c} />
        </>
      )}
      {/* zone indisponible : la carte, avec le point d'exclamation */}
      {nom === 'carteMuette' && (
        <>
          <Path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" {...c} />
          <Path d="M12 10v4M12 17h.01" {...c} />
        </>
      )}
      {nom === 'fermer' && <Path d="M6 6l12 12M18 6L6 18" {...c} />}
      {nom === 'retour' && <Path d="M15 18l-6-6 6-6" {...c} />}
      {nom === 'lecture' && <Path d="M7 5l12 7-12 7V5z" {...c} />}
      {nom === 'coche' && <Path d="M20 6L9 17l-5-5" {...c} strokeWidth={strokeWidth * 1.5} />}
      {nom === 'bouclier' && (
        <>
          <Rect x={4} y={4} width={16} height={16} rx={3} {...c} />
          <Path d="M9 12l2 2 4-4" {...c} />
        </>
      )}
      {nom === 'horloge' && (
        <>
          <Circle cx={12} cy={12} r={9} {...c} />
          <Path d="M12 7v5l3 2" {...c} />
        </>
      )}
      {nom === 'reglages' && (
        <>
          <Circle cx={12} cy={12} r={3.2} {...c} />
          <Path
            d="M12 3.5v2.6M12 17.9v2.6M20.5 12h-2.6M6.1 12H3.5M17.66 6.34l-1.84 1.84M8.18 15.82l-1.84 1.84M17.66 17.66l-1.84-1.84M8.18 8.18L6.34 6.34"
            {...c}
          />
        </>
      )}
      {nom === 'ami' && (
        <>
          <Circle cx={9} cy={8.5} r={3.2} {...c} />
          <Path d="M3.5 20v-.8a5.2 5.2 0 0 1 5.2-5.2h.6a5.2 5.2 0 0 1 5.2 5.2v.8" {...c} />
          <Path d="M18 8v5M15.5 10.5h5" {...c} />
        </>
      )}
      {nom === 'crayon' && (
        <Path d="M4 20l1-4.2L15.5 5.3a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L8.2 19 4 20z" {...c} />
      )}
    </Svg>
  );
}
