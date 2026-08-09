// Sérialise le graphe produit par buildGraph() (des Map/Set, non JSON-
// natives) en structures simples pour le cache jsonb et la réponse HTTP.
// Contrat partagé avec le client (Phase 2, mobile/src/hooks/useWalkedia.ts) :
// toute évolution de forme doit être reportée des deux côtés.

export interface SerializedGraph {
  nodes: [string, { key: string; lat: number; lon: number; edgeIds: string[] }][];
  edges: [string, any][];
  junctions: [string, { id: string; lat: number; lon: number; members: string[]; requiredEdgeIds: string[] }][];
  edgeJunctions: [string, string[]][];
}

export function serializeGraph(graph: {
  nodes: Map<string, any>;
  edges: Map<string, any>;
  junctions: Map<string, any>;
  edgeJunctions: Map<string, string[]>;
}): SerializedGraph {
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
