// Découpe et sérialise le graphe produit par buildGraph() pour le cache
// jsonb et la réponse HTTP (des Map/Set, non JSON-natives).
// Contrat partagé avec le client (mobile/src/logic/regionGraph.ts) : toute
// évolution de forme doit être reportée des deux côtés ET s'accompagner
// d'un bump de VERSION dans get-region/index.ts.

import { haversine, pointAtFraction } from './geo.ts';

export interface SerializedGraph {
  nodes: [string, { key: string; lat: number; lon: number; edgeIds: string[] }][];
  edges: [string, any][];
  junctions: [string, { id: string; lat: number; lon: number; members: string[]; branchEdgeIds: string[] }][];
}

interface Graph {
  nodes: Map<string, any>;
  edges: Map<string, any>;
  junctions: Map<string, any>;
}

// Ne garde du graphe construit sur BUILD_RADIUS que ce qui est à moins de
// `radius` du centre (voir la marge de construction dans get-region/index.ts).
// Un tronçon est retenu si son MILIEU est dans le cercle — pas ses extrémités :
// un long tronçon qui traverse le bord appartient à la zone dans laquelle
// il est majoritairement, et la zone voisine le servira à l'identique.
// Les tronçons qui partent d'un point retenu sont toujours embarqués, même
// hors cercle : sans eux, ce point n'aurait pas ses branches.
//
// Les POINTS servis, eux, sont ceux du cercle PLUS les extrémités des
// tronçons retenus. C'est ce qui rend chaque zone jouable jusqu'à son bord :
// la validation d'un tronçon demande d'avoir atteint ses DEUX points (règle
// D1), donc servir un tronçon sans l'un de ses bouts le rendrait invalidable
// tant que la zone voisine n'est pas chargée. Les listes de branches d'un
// point ainsi rapatrié sont restreintes à ce qui est réellement servi ; la
// fusion côté client les réunit (mergeGraph unit les branches, il ne garde
// pas la première version rencontrée).
export function clipGraph(graph: Graph, center: [number, number], radius: number): Graph {
  const near = (lat: number, lon: number) => haversine([lat, lon], center) <= radius;

  const edges = new Map<string, any>();
  for (const [id, e] of graph.edges) {
    const [mlat, mlon] = pointAtFraction(e.coords, 0.5);
    if (near(mlat, mlon)) edges.set(id, e);
  }

  const dansLeCercle = new Set<string>();
  for (const [id, j] of graph.junctions) {
    if (!near(j.lat, j.lon)) continue;
    dansLeCercle.add(id);
    for (const eid of j.branchEdgeIds) {
      if (!edges.has(eid)) edges.set(eid, graph.edges.get(eid));
    }
  }

  const junctions = new Map<string, any>();
  const retenir = (id: string) => {
    if (junctions.has(id)) return;
    const j = graph.junctions.get(id);
    if (!j) return;
    const branches = new Set<string>();
    for (const eid of j.branchEdgeIds) if (edges.has(eid)) branches.add(eid);
    junctions.set(id, { ...j, branchEdgeIds: branches });
  };
  for (const id of dansLeCercle) retenir(id);
  for (const e of edges.values()) {
    retenir(e.ja);
    retenir(e.jb);
  }

  // Nœuds : uniquement les extrémités des tronçons retenus, et leur liste
  // de tronçons est restreinte à ceux-ci (sinon le client référencerait des
  // tronçons qu'il n'a pas — cette liste sert à la simulation de marche et au
  // parcours du graphe). `new Set([e.a, e.b])` : un tronçon qui boucle sur son
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

  return { nodes, edges, junctions };
}

export function serializeGraph(graph: Graph): SerializedGraph {
  return {
    nodes: [...graph.nodes.entries()],
    edges: [...graph.edges.entries()],
    junctions: [...graph.junctions.entries()].map(([id, j]) => [
      id,
      { ...j, branchEdgeIds: [...j.branchEdgeIds] },
    ]),
  };
}
