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
// produisent alors exactement les mêmes tronçons là où elles se recouvrent, aux
// mêmes IDs.
//
// Vocabulaire (spécification, section 0) : un `Junction` est un POINT
// D'INTERSECTION — le nœud interactif que le joueur atteint —, un `Edge` est
// un TRONÇON reliant deux points adjacents. Les noms de types restent ceux
// d'origine pour ne pas renommer la moitié de l'app ; les champs, eux, disent
// la spécification.

export interface Edge {
  id: string;
  coords: [number, number][]; // géométrie OSM : ce qui se dessine (B2)
  length: number;
  a: string; // clé du nœud OSM de départ (coords[0])
  b: string; // clé du nœud OSM d'arrivée (dernier point)
  ja: string; // point d'intersection à l'extrémité `a`
  jb: string; // point d'intersection à l'extrémité `b`
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
  members: string[]; // nœuds OSM consolidés en ce point (A2)
  branchEdgeIds: Set<string>; // tronçons qui partent de ce point
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, Edge>;
  junctions: Map<string, Junction>;
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
  return { nodes: new Map(), edges: new Map(), junctions: new Map() };
}

// Fusion d'une zone dans le graphe cumulé. Les IDs étant géométriques et
// stables (voir _shared/graph.ts), un élément déjà connu est identique à
// celui qui arrive : premier arrivé, premier servi. Seules les listes
// (tronçons d'un nœud, branches d'un point) s'unissent, parce qu'une zone
// n'en voit que la part qui tombe chez elle — un point servi au bord d'une
// zone n'y a qu'une partie de ses branches, l'autre arrive avec la zone
// voisine.
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
    const existing = target.junctions.get(id);
    if (!existing) {
      target.junctions.set(id, { ...j, branchEdgeIds: new Set(j.branchEdgeIds) });
      continue;
    }
    for (const eid of j.branchEdgeIds) existing.branchEdgeIds.add(eid);
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
        { ...j, branchEdgeIds: new Set<string>(j.branchEdgeIds) },
      ])
    ),
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
