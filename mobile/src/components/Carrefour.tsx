// Le glyphe de carrefour : la marque de Walkedia, déclinée à toutes les
// échelles (marqueur de 17 px sur la carte, vignette de 44 px dans une carte
// d'objectif, pièce de 230 px dans l'onboarding).
//
// Une branche se lit comme une rue : une bande claire toujours visible, un axe
// en pointillés tant qu'elle reste à marcher, la bande en violet une fois
// relevée. Le disque central ne se remplit que lorsque toutes les branches y
// sont passées : c'est la règle du jeu, rendue en une image.

import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS } from '../theme';

// [angle en degrés (0 = est, sens trigonométrique), marchée ?]
export type Branche = [number, boolean];

export function Carrefour({
  size,
  branches,
  style,
}: {
  size: number;
  branches: Branche[];
  style?: any;
}) {
  const c = size / 2;
  const rayon = size * 0.44;
  const rue = Math.max(4, size * 0.115);
  const complet = branches.length > 0 && branches.every((b) => b[1]);

  const bout = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return { x: c + Math.cos(rad) * rayon, y: c - Math.sin(rad) * rayon };
  };

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={style}>
      {branches.map((b, i) => {
        const p = bout(b[0]);
        const d = `M${c} ${c}L${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        return (
          <React.Fragment key={i}>
            <Path d={d} stroke="#DAD8E4" strokeWidth={rue} strokeLinecap="round" fill="none" />
            {b[1] && (
              <Path d={d} stroke={COLORS.trace} strokeWidth={rue} strokeLinecap="round" fill="none" />
            )}
            {!b[1] && size >= 40 && (
              <Path
                d={d}
                stroke={COLORS.encre}
                strokeOpacity={0.28}
                strokeWidth={Math.max(1, rue * 0.11)}
                strokeDasharray={`${(rue * 0.36).toFixed(1)} ${(rue * 0.32).toFixed(1)}`}
                fill="none"
              />
            )}
          </React.Fragment>
        );
      })}

      {complet ? (
        <Circle
          cx={c}
          cy={c}
          r={rue * 0.88}
          fill={COLORS.trace}
          stroke={COLORS.traceFonce}
          strokeWidth={Math.max(1.2, rue * 0.13)}
        />
      ) : (
        <Circle
          cx={c}
          cy={c}
          r={rue * 0.6}
          fill={COLORS.surface}
          stroke={COLORS.encre}
          strokeOpacity={0.42}
          strokeWidth={Math.max(1.2, size * 0.02)}
        />
      )}
    </Svg>
  );
}
