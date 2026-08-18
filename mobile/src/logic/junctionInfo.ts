// Dérivations d'affichage autour d'un carrefour : son numéro, l'orientation de
// ses branches, et le carrefour incomplet le plus proche d'une position.
//
// Pas de nom de rue : trop de carrefours ont une rue sans nom dans OSM (voir
// regionGraph.ts, Edge n'a pas de champ `name`), et le graphe ne le porterait
// de toute façon pas. L'app décrit une branche manquante par son orientation
// cardinale, jamais par un nom.

import type { Graph, Junction } from './regionGraph';
import type { Progress } from './storage';
import { haversine, makeProj } from './geo';
import type { Branche } from '../components/Carrefour';

// Un carrefour complété prend le numéro suivant dans le relevé du joueur : pas
// une propriété du carrefour lui-même, mais son rang parmi ceux que CE joueur
// a complétés. `progress.junctions` est un Set, dont l'ordre d'itération suit
// l'ordre d'insertion en JS — donc l'ordre de complétion réel.
export function pointNumber(progress: Progress, junctionId: string): number | null {
  let i = 0;
  for (const id of progress.junctions) {
    i++;
    if (id === junctionId) return i;
  }
  return null;
}

// Angle au sens du glyphe (Carrefour.tsx) : 0° = est, 90° = nord, sens
// trigonométrique. `dx`/`dy` viennent de la projection locale (geo.ts,
// makeProj), donc déjà en mètres plans — un simple atan2 suffit à cette
// échelle.
function angleDeg(dx: number, dy: number): number {
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

// Les 8 secteurs de 45°, centrés sur chaque direction cardinale/intercardinale.
const SECTEURS = ['est', 'nord-est', 'nord', 'nord-ouest', 'ouest', 'sud-ouest', 'sud', 'sud-est'];

export function orientation(angle: number): string {
  const a = ((angle % 360) + 360) % 360;
  return SECTEURS[Math.round(a / 45) % 8];
}

// Point de la polyligne du côté opposé au carrefour, pour viser la bonne
// direction : `edge.a` est toujours `coords[0]`, `edge.b` toujours
// `coords[coords.length - 1]` (voir supabase/functions/_shared/graph.ts).
function directionFromJunction(graph: Graph, junction: Junction, edgeId: string): number | null {
  const edge = graph.edges.get(edgeId);
  if (!edge || edge.coords.length < 2) return null;
  const proj = makeProj(junction.lat);
  const cotéA = junction.members.includes(edge.a);
  const ici = cotéA ? edge.coords[0] : edge.coords[edge.coords.length - 1];
  const suivant = cotéA ? edge.coords[1] : edge.coords[edge.coords.length - 2];
  const [x1, y1] = proj(ici[0], ici[1]);
  const [x2, y2] = proj(suivant[0], suivant[1]);
  return angleDeg(x2 - x1, y2 - y1);
}

// Toutes les branches d'un carrefour, marchées ou non — pour le glyphe
// (Carrefour.tsx). Une branche dont la direction ne peut pas être déterminée
// (géométrie incomplète) est simplement omise plutôt que dessinée au hasard.
export function branchesForGlyph(graph: Graph, junction: Junction, progressEdges: Set<string>): Branche[] {
  const branches: Branche[] = [];
  for (const edgeId of junction.requiredEdgeIds) {
    const angle = directionFromJunction(graph, junction, edgeId);
    if (angle == null) continue;
    branches.push([angle, progressEdges.has(edgeId)]);
  }
  return branches;
}

// Orientations des branches qui manquent encore, pour le texte de la carte
// d'objectif ( « il te manque la rue ouest » ). Peut renvoyer plusieurs
// orientations, ou aucune si la géométrie manque.
export function orientationsManquantes(graph: Graph, junction: Junction, progressEdges: Set<string>): string[] {
  const dirs: string[] = [];
  for (const edgeId of junction.requiredEdgeIds) {
    if (progressEdges.has(edgeId)) continue;
    const angle = directionFromJunction(graph, junction, edgeId);
    if (angle != null) dirs.push(orientation(angle));
  }
  return dirs;
}

export interface Objectif {
  junction: Junction;
  distance: number;
}

// Le carrefour incomplet le plus proche d'une position, parmi ceux déjà
// chargés en mémoire. `null` si le graphe est vide ou si tout est complété.
export function objectifLePlusProche(
  graph: Graph,
  progressJunctions: Set<string>,
  pos: [number, number]
): Objectif | null {
  let meilleur: Objectif | null = null;
  for (const junction of graph.junctions.values()) {
    if (progressJunctions.has(junction.id)) continue;
    const distance = haversine(pos, [junction.lat, junction.lon]);
    if (!meilleur || distance < meilleur.distance) meilleur = { junction, distance };
  }
  return meilleur;
}
