// Découpe et sérialise le graphe produit par buildGraph() pour le cache
// jsonb et la réponse HTTP (des Map/Set, non JSON-natives).
// Contrat partagé avec le client (mobile/src/logic/region.ts) : toute
// évolution de forme doit être reportée des deux côtés ET s'accompagner
// d'un bump de VERSION dans get-region/index.ts.

import { haversine, pointAtFraction } from './geo.ts';

export interface SerializedGraph {
  nodes: [string, { key: string; lat: number; lon: number; edgeIds: string[] }][];
  edges: [string, any][];
  junctions: [string, { id: string; lat: number; lon: number; members: string[]; requiredEdgeIds: string[] }][];
  edgeJunctions: [string, string[]][];
}

interface Graph {
  nodes: Map<string, any>;
  edges: Map<string, any>;
  junctions: Map<string, any>;
  edgeJunctions: Map<string, string[]>;
}

// Ne garde du graphe construit sur BUILD_RADIUS que ce qui est à moins de
// `radius` du centre (voir la marge de construction dans get-region/index.ts).
// Une arête est retenue si son MILIEU est dans le cercle — pas ses extrémités :
// une longue arête qui traverse le bord appartient à la zone dans laquelle
// elle est majoritairement, et la zone voisine la servira à l'identique.
// Les arêtes exigées par un carrefour retenu sont toujours embarquées, même
// hors cercle, sinon ce carrefour serait incomplétable côté client.
export function clipGraph(graph: Graph, center: [number, number], radius: number): Graph {
  const near = (lat: number, lon: number) => haversine([lat, lon], center) <= radius;

  const edges = new Map<string, any>();
  for (const [id, e] of graph.edges) {
    const [mlat, mlon] = pointAtFraction(e.coords, 0.5);
    if (near(mlat, mlon)) edges.set(id, e);
  }

  const junctions = new Map<string, any>();
  for (const [id, j] of graph.junctions) {
    if (!near(j.lat, j.lon)) continue;
    junctions.set(id, j);
    for (const eid of j.requiredEdgeIds) {
      if (!edges.has(eid)) edges.set(eid, graph.edges.get(eid));
    }
  }

  // Nœuds : uniquement les extrémités des arêtes retenues, et leur liste
  // d'arêtes est restreinte à celles-ci (sinon le client référencerait des
  // arêtes qu'il n'a pas — cette liste sert à la simulation de marche et au
  // parcours du graphe). `new Set([e.a, e.b])` : une arête qui boucle sur son
  // nœud ne doit y figurer qu'une fois, sinon la fusion côté client n'est
  // plus idempotente (elle dédoublonne, la première zone reçue non).
  const nodes = new Map<string, any>();
  for (const e of edges.values()) {
    for (const key of new Set([e.a, e.b])) {
      const n = graph.nodes.get(key);
      if (!n) continue;
      let kept = nodes.get(key);
      if (!kept) nodes.set(key, (kept = { key: n.key, lat: n.lat, lon: n.lon, edgeIds: [] }));
      kept.edgeIds.push(e.id);
    }
  }

  const edgeJunctions = new Map<string, string[]>();
  for (const [eid, list] of graph.edgeJunctions) {
    if (!edges.has(eid)) continue;
    const kept = list.filter((jid) => junctions.has(jid));
    if (kept.length) edgeJunctions.set(eid, kept);
  }

  return { nodes, edges, junctions, edgeJunctions };
}

export function serializeGraph(graph: Graph): SerializedGraph {
  return {
    nodes: [...graph.nodes.entries()],
    edges: [...graph.edges.entries()],
    junctions: [...graph.junctions.entries()].map(([id, j]) => [
      id,
      { ...j, requiredEdgeIds: [...j.requiredEdgeIds] },
    ]),
    edgeJunctions: [...graph.edgeJunctions.entries()],
  };
}
