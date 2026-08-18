// Plan schématique : le fond de carte dessiné des écrans d'onboarding.
//
// Ce n'est pas la vraie carte (react-native-maps), mais une trame de rues
// inventée. Elle sert à montrer la règle avant que l'app ait la moindre donnée
// réelle : au premier lancement, il n'y a ni position ni zone chargée, et un
// écran d'explication ne peut pas attendre le réseau.

import React from 'react';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { COLORS } from '../theme';
import type { Branche } from './Carrefour';

// [x, y, branches]
export type Noeud = [number, number, Branche[]];

const XS = [-14, 48, 112, 176, 244, 308, 374];
const RUE = 10;

export function PlanSchema({
  hauteur = 700,
  trace = [],
  noeuds = [],
  moi,
}: {
  hauteur?: number;
  trace?: string[];
  noeuds?: Noeud[];
  moi?: [number, number];
}) {
  const H = hauteur;
  const YS: number[] = [];
  for (let y = -14; y < H + 60; y += 68) YS.push(y);

  const ilots: React.ReactNode[] = [];
  for (let i = 0; i < XS.length - 1; i++) {
    for (let j = 0; j < YS.length - 1; j++) {
      const w = XS[i + 1] - XS[i] - RUE;
      const h = YS[j + 1] - YS[j] - RUE;
      if (w > 4 && h > 4) {
        ilots.push(
          <Rect
            key={`${i}-${j}`}
            x={XS[i] + RUE / 2}
            y={YS[j] + RUE / 2}
            width={w}
            height={h}
            rx={2.5}
            fill={COLORS.ilot}
          />
        );
      }
    }
  }

  const voieFerree = `M-20 ${H * 0.12} Q 150 ${H * 0.2} 380 ${H * 0.09}`;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 360 ${H}`} preserveAspectRatio="xMidYMid slice">
      <Rect x={0} y={0} width={360} height={H} fill={COLORS.rue} />
      <G>{ilots}</G>

      {/* avenue en diagonale : casse la grille pour que le plan ne soit pas un damier */}
      <Path d={`M-20 ${H * 0.78} L 380 ${H * 0.24}`} stroke={COLORS.rue} strokeWidth={16} fill="none" />

      {YS.length > 4 && (
        <Rect
          x={XS[3] + RUE / 2}
          y={YS[2] + RUE / 2}
          width={XS[4] - XS[3] - RUE}
          height={YS[4] - YS[2] - RUE}
          rx={4}
          fill={COLORS.vegetal}
        />
      )}

      <Path d={voieFerree} stroke={COLORS.rue} strokeWidth={9} fill="none" />
      <Path
        d={voieFerree}
        stroke={COLORS.encre}
        strokeOpacity={0.35}
        strokeWidth={2.5}
        strokeDasharray="7 6"
        fill="none"
      />

      {/* la trace : uniquement ce qui a été marché */}
      {trace.map((d, i) => (
        <React.Fragment key={`t${i}`}>
          <Path
            d={d}
            stroke={COLORS.trace}
            strokeOpacity={0.16}
            strokeWidth={13}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d={d}
            stroke={COLORS.trace}
            strokeWidth={4.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </React.Fragment>
      ))}

      {/* marqueurs de carrefour : le même glyphe que Carrefour.tsx, à l'échelle du plan */}
      {noeuds.map(([cx, cy, br], i) => {
        const complet = br.every((b) => b[1]);
        const r = 8.5;
        return (
          <G key={`n${i}`}>
            {br.map((b, k) => {
              const rad = (b[0] * Math.PI) / 180;
              return (
                <Line
                  key={k}
                  x1={cx + Math.cos(rad) * (r + 1.5)}
                  y1={cy - Math.sin(rad) * (r + 1.5)}
                  x2={cx + Math.cos(rad) * (r + 7)}
                  y2={cy - Math.sin(rad) * (r + 7)}
                  stroke={b[1] ? COLORS.trace : COLORS.encre}
                  strokeOpacity={b[1] ? 1 : 0.3}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              );
            })}
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              fill={complet ? COLORS.trace : '#FAFAF7'}
              stroke={complet ? COLORS.trace : COLORS.encre}
              strokeOpacity={complet ? 1 : 0.45}
              strokeWidth={1.8}
            />
          </G>
        );
      })}

      {moi && (
        <G>
          <Circle cx={moi[0]} cy={moi[1]} r={15} fill="none" stroke={COLORS.trace} strokeOpacity={0.55} strokeWidth={2} />
          <Circle cx={moi[0]} cy={moi[1]} r={7.5} fill={COLORS.surface} />
          <Circle cx={moi[0]} cy={moi[1]} r={5} fill={COLORS.trace} />
        </G>
      )}
    </Svg>
  );
}
