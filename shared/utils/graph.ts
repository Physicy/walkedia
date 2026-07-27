import { lineLength, pointAtFraction, haversine, type Coord } from './geo.js';
import type { Graph, Node, Edge, Junction } from '../types/index.js';

const STUB_MAX = 30;
const LINK_MAX = 25;
const CLUSTER_MAX = 60;

const CAR_HIGHWAYS = new Set([
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
]);

const DENSITY_CELL = 250;
const URBAN_MIN_ROAD = 2200;

export function nodeKey(c: Coord): string {
  return c[0].toFixed(6) + ',' + c[1].toFixed(6);
}

function coordKey5(c: Coord): string {
  return c[0].toFixed(5) + ',' + c[1].toFixed(5);
}

function edgeId(coords: Coord[], length: number): string {
  const a = coordKey5(coords[0]);
  const b = coordKey5(coords[coords.length - 1]);
  const mid = coordKey5(pointAtFraction(coords, 0.5));
  const ends = a < b ? a + '|' + b : b + '|' + a;
  return ends + '|' + mid + '|' + Math.round(length);
}

interface OSMNode extends Coord {
  0: number; // lat
  1: number; // lon
}

interface OSMWay {
  nodes: string[];
  tags: Record<string, string>;
}

interface OSMData {
  ways: OSMWay[];
  nodes: Map<string, Coord>;
}

export function buildGraph(osm: OSMData): Graph {
  const pairKey = (a: string, b: string) => (a < b ? a + ':' + b : b + ':' + a);
  const carPairs = new Set<string>();
  const onewayPairs = new Set<string>();
  const roundaboutPairs = new Set<string>();
  const crossingPairs = new Set<string>();

  for (const w of osm.ways) {
    const t = w.tags;
    const car = CAR_HIGHWAYS.has(t.highway);
    const oneway = t.oneway === 'yes' || t.oneway === '1' || t.oneway === '-1';
    const roundabout = t.junction === 'roundabout' || t.junction === 'circular';
    const crossing = t.footway === 'crossing' || t.path === 'crossing';
    if (!car && !oneway && !roundabout && !crossing) continue;
    for (let i = 1; i < w.nodes.length; i++) {
      const k = pairKey(w.nodes[i - 1], w.nodes[i]);
      if (car) carPairs.add(k);
      if (oneway) onewayPairs.add(k);
      if (roundabout) roundaboutPairs.add(k);
      if (crossing) crossingPairs.add(k);
    }
  }

  const usage = new Map<string, number>();
  for (const w of osm.ways) {
    for (const nid of w.nodes) usage.set(nid, (usage.get(nid) || 0) + 1);
  }
  const isJunction = (nid: string) => (usage.get(nid) || 0) >= 2;

  interface Segment {
    nodes: string[];
    dead: boolean;
  }

  const all: Segment[] = [];
  for (const w of osm.ways) {
    let start = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      if (i === w.nodes.length - 1 || isJunction(w.nodes[i])) {
        all.push({ nodes: w.nodes.slice(start, i + 1), dead: false });
        start = i;
      }
    }
  }

  const adj = new Map<string, Segment[]>();
  const addAdj = (nid: string, seg: Segment) => {
    let list = adj.get(nid);
    if (!list) adj.set(nid, (list = []));
    list.push(seg);
  };
  for (const s of all) {
    addAdj(s.nodes[0], s);
    addAdj(s.nodes[s.nodes.length - 1], s);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [nid, list] of adj) {
      const live = list.filter((s) => !s.dead);
      adj.set(nid, live);
      if (live.length !== 2 || live[0] === live[1]) continue;
      const [s1, s2] = live;
      let n1 = s1.nodes.slice();
      let n2 = s2.nodes.slice();
      if (n1[0] === nid) n1.reverse();
      if (n2[n2.length - 1] === nid) n2.reverse();
      if (n1[n1.length - 1] !== nid || n2[0] !== nid) continue;
      const merged: Segment = { nodes: n1.concat(n2.slice(1)), dead: false };
      s1.dead = true;
      s2.dead = true;
      adj.set(nid, []);
      all.push(merged);
      addAdj(merged.nodes[0], merged);
      addAdj(merged.nodes[merged.nodes.length - 1], merged);
      changed = true;
    }
  }

  const edges = new Map<string, Edge>();
  const nodes = new Map<string, Node>();

  for (const s of all) {
    if (s.dead) continue;
    const coords = s.nodes
      .map((nid) => osm.nodes.get(nid))
      .filter((c): c is Coord => c != null);
    if (coords.length < 2) continue;
    const length = lineLength(coords);
    if (length < 1) continue;
    const id = edgeId(coords, length);
    if (edges.has(id)) continue;

    let carLen = 0;
    let onewayLen = 0;
    let roundLen = 0;
    let crossLen = 0;
    for (let i = 1; i < s.nodes.length; i++) {
      const k = pairKey(s.nodes[i - 1], s.nodes[i]);
      const ca = osm.nodes.get(s.nodes[i - 1]);
      const cb = osm.nodes.get(s.nodes[i]);
      if (!ca || !cb) continue;
      const d = haversine(ca, cb);
      if (carPairs.has(k)) carLen += d;
      if (onewayPairs.has(k)) onewayLen += d;
      if (roundaboutPairs.has(k)) roundLen += d;
      if (crossingPairs.has(k)) crossLen += d;
    }

    const e: Edge = {
      id,
      coords,
      length,
      car: carLen / length >= 0.5,
      oneway: onewayLen / length >= 0.5,
      roundabout: roundLen / length >= 0.5,
      crossing: crossLen / length >= 0.5,
      a: nodeKey(coords[0]),
      b: nodeKey(coords[coords.length - 1]),
    };
    edges.set(id, e);
    const nodeEnds: Array<[string, Coord]> = [
      [e.a, coords[0]],
      [e.b, coords[coords.length - 1]],
    ];
    for (const [key, c] of nodeEnds) {
      let n = nodes.get(key);
      if (!n)
        nodes.set(key, (n = { key, lat: c[0], lon: c[1], edgeIds: [] }));
      n.edgeIds.push(id);
    }
  }

  let lat0 = 0;
  let count = 0;
  for (const n of nodes.values()) {
    lat0 += n.lat;
    if (++count >= 50) break;
  }
  lat0 = count ? lat0 / count : 0;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const cellKey = (lat: number, lon: number) =>
    Math.floor((lon * kx) / DENSITY_CELL) + ':' + Math.floor((lat * ky) / DENSITY_CELL);
  const density = new Map<string, number>();
  for (const e of edges.values()) {
    if (!e.car) continue;
    for (let i = 1; i < e.coords.length; i++) {
      const mid: [number, number] = [
        (e.coords[i - 1][0] + e.coords[i][0]) / 2,
        (e.coords[i - 1][1] + e.coords[i][1]) / 2,
      ];
      const k = cellKey(mid[0], mid[1]);
      density.set(k, (density.get(k) || 0) + haversine(e.coords[i - 1], e.coords[i]));
    }
  }

  const isUrban = (lat: number, lon: number) => {
    const cx = Math.floor((lon * kx) / DENSITY_CELL);
    const cy = Math.floor((lat * ky) / DENSITY_CELL);
    let sum = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) sum += density.get(cx + dx + ':' + (cy + dy)) || 0;
    }
    return sum >= URBAN_MIN_ROAD;
  };

  const isStubFor = (e: Edge, key: string): boolean => {
    const other = e.a === key ? e.b : e.a;
    if (other === key) return e.length < STUB_MAX;
    return e.length < STUB_MAX && nodes.get(other)!.edgeIds.length === 1;
  };

  const candidates = new Set<string>();
  const urbanNode = new Map<string, boolean>();
  for (const n of nodes.values()) {
    const urban = isUrban(n.lat, n.lon);
    const pool = urban ? n.edgeIds.filter((id) => edges.get(id)!.car) : n.edgeIds;
    const sig = pool.filter((id) => !isStubFor(edges.get(id)!, n.key));
    if (sig.length >= 3) {
      candidates.add(n.key);
      urbanNode.set(n.key, urban);
    }
  }

  const onewayHub = new Set<string>();
  for (const n of nodes.values()) {
    let ow = 0;
    for (const id of n.edgeIds) {
      const e = edges.get(id)!;
      if (e.car && e.oneway) ow++;
    }
    if (ow >= 2) onewayHub.add(n.key);
  }

  const isArtifactLink = (e: Edge): boolean =>
    e.roundabout || (e.car && e.oneway) || (!e.car && e.crossing) || onewayHub.has(e.a) || onewayHub.has(e.b);

  interface BBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  }

  const parent = new Map<string, string>();
  const bbox = new Map<string, BBox>();
  for (const key of candidates) {
    parent.set(key, key);
    const n = nodes.get(key)!;
    bbox.set(key, { minLat: n.lat, maxLat: n.lat, minLon: n.lon, maxLon: n.lon });
  }

  const find = (k: string): string => {
    while (parent.get(k) !== k) {
      parent.set(k, parent.get(parent.get(k)!)!);
      k = parent.get(k)!;
    }
    return k;
  };

  for (const e of edges.values()) {
    if (e.length >= LINK_MAX) continue;
    if (!candidates.has(e.a) || !candidates.has(e.b) || e.a === e.b) continue;
    if (!isArtifactLink(e)) continue;
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) continue;
    const A = bbox.get(ra)!;
    const B = bbox.get(rb)!;
    const m: BBox = {
      minLat: Math.min(A.minLat, B.minLat),
      maxLat: Math.max(A.maxLat, B.maxLat),
      minLon: Math.min(A.minLon, B.minLon),
      maxLon: Math.max(A.maxLon, B.maxLon),
    };
    if (haversine([m.minLat, m.minLon], [m.maxLat, m.maxLon]) > CLUSTER_MAX) continue;
    parent.set(ra, rb);
    bbox.set(rb, m);
  }

  const clusters = new Map<string, string[]>();
  for (const key of candidates) {
    const r = find(key);
    let list = clusters.get(r);
    if (!list) clusters.set(r, (list = []));
    list.push(key);
  }

  const junctions = new Map<string, Junction>();
  const edgeJunctions = new Map<string, string[]>();
  for (const members of clusters.values()) {
    const memberSet = new Set(members);
    const urban = members.some((key) => urbanNode.get(key));
    const required = new Set<string>();
    for (const key of members) {
      for (const id of nodes.get(key)!.edgeIds) {
        const e = edges.get(id)!;
        if (urban && !e.car) continue;
        if (memberSet.has(e.a) && memberSet.has(e.b)) continue;
        if (isStubFor(e, key)) continue;
        required.add(id);
      }
    }
    if (required.size < 3) continue;

    members.sort();
    const id = members[0];
    let lat = 0;
    let lon = 0;
    for (const key of members) {
      const n = nodes.get(key)!;
      lat += n.lat;
      lon += n.lon;
    }
    const j: Junction = {
      id,
      lat: lat / members.length,
      lon: lon / members.length,
      members,
      requiredEdgeIds: required,
    };
    junctions.set(id, j);
    for (const eid of required) {
      let list = edgeJunctions.get(eid);
      if (!list) edgeJunctions.set(eid, (list = []));
      list.push(id);
    }
  }

  return { nodes, edges, junctions, edgeJunctions };
}
