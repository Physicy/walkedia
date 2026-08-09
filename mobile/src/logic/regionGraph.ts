// Forme du graphe côté client et fusion des zones reçues de l'Edge Function
// `get-region`. Volontairement sans dépendance React Native ni Supabase (la
// partie réseau est dans region.ts) : ce fichier décrit un contrat de données
// partagé avec supabase/functions/_shared/serialize.ts, et doit pouvoir
// tourner tel quel dans un script de vérification.
//
// Le client ne construit plus le graphe : il n'accumule plus l'OSM brut pour
// tout reconstruire à chaque nouvelle zone (l'ancien fetchZone + buildGraph),
// il colle bout à bout des graphes déjà construits. C'est possible parce que
// le serveur construit avec une marge autour de ce qu'il sert (voir
// BUILD_RADIUS/SERVE_RADIUS dans get-region/index.ts) : deux zones voisines
// produisent alors exactement les mêmes arêtes là où elles se recouvrent, aux
// mêmes IDs. Mesuré sur 4 zones adjacentes : 1 arête d'écart sur 4834 à
// Paris, 0 en périurbain — contre 3 à 6 % d'arêtes en double sans la marge.

export interface Edge {
  id: string;
  coords: [number, number][];
  length: number;
  car: boolean;
  oneway: boolean;
  roundabout: boolean;
  crossing: boolean;
  a: string;
  b: string;
}

export interface GraphNode {
  key: string;
  lat: number;
  lon: number;
  edgeIds: string[];
}

export interface Junction {
  id: string;
  lat: number;
  lon: number;
  members: string[];
  requiredEdgeIds: Set<string>;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, Edge>;
  junctions: Map<string, Junction>;
  edgeJunctions: Map<string, string[]>;
}

export interface Neighborhood {
  id: number;
  name: string | null;
  ring: [number, number][];
}

export interface Region {
  center: [number, number];
  radius: number;
  graph: Graph;
  neighborhoods: Neighborhood[];
  junctionNeighborhood: [string, number | null][];
}

export function emptyGraph(): Graph {
  return { nodes: new Map(), edges: new Map(), junctions: new Map(), edgeJunctions: new Map() };
}

// Fusion d'une zone dans le graphe cumulé. Les IDs étant géométriques et
// stables (voir _shared/graph.ts), un élément déjà connu est identique à
// celui qui arrive : premier arrivé, premier servi. Seules les listes
// (branches d'un nœud, carrefours d'une arête) s'unissent, parce qu'une zone
// n'en voit que la part qui tombe chez elle.
export function mergeGraph(target: Graph, incoming: Graph) {
  for (const [id, e] of incoming.edges) {
    if (!target.edges.has(id)) target.edges.set(id, e);
  }
  for (const [key, n] of incoming.nodes) {
    const existing = target.nodes.get(key);
    if (!existing) {
      target.nodes.set(key, { ...n, edgeIds: [...n.edgeIds] });
      continue;
    }
    for (const id of n.edgeIds) {
      if (!existing.edgeIds.includes(id)) existing.edgeIds.push(id);
    }
  }
  for (const [id, j] of incoming.junctions) {
    if (!target.junctions.has(id)) target.junctions.set(id, j);
  }
  for (const [eid, list] of incoming.edgeJunctions) {
    const existing = target.edgeJunctions.get(eid);
    if (!existing) {
      target.edgeJunctions.set(eid, [...list]);
      continue;
    }
    for (const jid of list) {
      if (!existing.includes(jid)) existing.push(jid);
    }
  }
}

// Réhydrate le payload JSON (des paires clé/valeur, voir serializeGraph côté
// serveur) en Map/Set exploitables.
export function deserializeGraph(raw: any): Graph {
  return {
    nodes: new Map(raw.nodes),
    edges: new Map(raw.edges),
    junctions: new Map(
      (raw.junctions as [string, any][]).map(([id, j]) => [
        id,
        { ...j, requiredEdgeIds: new Set<string>(j.requiredEdgeIds) },
      ])
    ),
    edgeJunctions: new Map(raw.edgeJunctions),
  };
}

export function deserializeRegion(payload: any): Region {
  return {
    center: payload.center,
    radius: payload.radius,
    graph: deserializeGraph(payload.graph),
    neighborhoods: payload.neighborhoods || [],
    junctionNeighborhood: payload.junctionNeighborhood || [],
  };
}
