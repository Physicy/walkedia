export interface Coord {
  0: number; // lat
  1: number; // lon
}

export interface Edge {
  id: string;
  coords: Coord[];
  length: number;
  car: boolean;
  oneway: boolean;
  roundabout: boolean;
  crossing: boolean;
  a: string; // nodeKey
  b: string; // nodeKey
}

export interface Node {
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
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
  junctions: Map<string, Junction>;
  edgeJunctions: Map<string, string[]>;
}

export interface LocationFix {
  lat: number;
  lon: number;
  accuracy?: number;
  speedKmh?: number;
  timestamp: number;
}

export interface Session {
  id: string;
  startedAt: number;
  endedAt?: number;
  edges: string[];
  junctions: string[];
  imported?: boolean;
  distance: number;
}

export interface StorageData {
  edges: Set<string>;
  junctions: Set<string>;
  sessions: Session[];
}
