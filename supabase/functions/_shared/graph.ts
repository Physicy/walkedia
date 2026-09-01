// Construction du graphe. Seul exemplaire depuis la bascule du client sur
// l'Edge Function : le client ne construit plus rien, il fusionne des zones
// déjà construites (voir mobile/src/logic/region.ts). Toute modification ici
// change les IDs d'arêtes/carrefours servis, donc invalide la progression
// déjà enregistrée par les joueurs — bumper VERSION dans get-region/index.ts.
//
//  1. repérage des nœuds de jonction (partagés par plusieurs ways),
//  2. découpage des ways en segments entre jonctions,
//  3. fusion des chaînes de degré 2 pour que chaque arête de base relie deux
//     "vrais" nœuds du graphe (intersections ou impasses),
//  4. attribution d'identifiants d'arêtes stables, dérivés de la géométrie
//     (indépendants des IDs OSM, qui peuvent changer),
//  5. détection des carrefours : degré calculé sur les branches
//     significatives (les impasses courtes ne comptent pas), puis
//     consolidation des nœuds trop proches en un seul carrefour — OSM
//     fragmente un carrefour réel en 4 à 8 nœuds (trottoirs, passages
//     piétons, chaussées séparées),
//  6. RE-DÉCOUPAGE EN TRONÇONS : un tronçon est un chemin qui relie deux
//     carrefours (règle de gestion, voir plus bas),
//  7. réécriture des exigences de chaque carrefour dans ce vocabulaire.
//
// Règle du tronçon (étape 6). Les arêtes des étapes 1 à 4 s'arrêtent à tout
// nœud partagé par plusieurs ways : une entrée de parking, un trottoir qui
// rejoint la chaussée ou un passage piéton coupaient une rue en cinq bouts,
// tous comptés comme autant de tronçons. Un tronçon est maintenant une
// CHAÎNE d'arêtes de base, poursuivie tant que le nœud traversé n'est pas un
// carrefour ET n'a que deux branches significatives, et retenue seulement si
// ses DEUX extrémités sont des carrefours. Conséquences assumées :
//   - les impasses disparaissent du graphe (rien à leur bout), donc du
//     comptage comme de la carte ;
//   - les antennes piétonnes en ville aussi (elles ne sont déjà pas des
//     branches significatives d'un nœud urbain) ;
//   - une chaîne qui bute sur une fourche qui n'est pas un carrefour est
//     abandonnée plutôt que prolongée au hasard : il n'y a pas de
//     continuation évidente à un embranchement.
// La détection des carrefours (étape 5) est INCHANGÉE : c'est le tronçon qui
// change de définition, pas le carrefour.
//
// Limite connue, héritée de la découpe en zones : le graphe est tronqué au
// BUILD_RADIUS (voir get-region/index.ts), ce qui fabrique de fausses
// impasses sur le bord. Une chaîne qui les atteint est abandonnée, alors que
// la zone voisine la verrait entière. La marge de construction (1000 m
// construits pour 550 m servis) garde ce cas hors de ce qui est réellement
// servi tant qu'un tronçon reste sous ~900 m — comme pour la fusion de
// degré 2, qui a déjà exactement cette propriété.
//
// En environnement urbain (densité locale de voirie carrossable élevée),
// seuls les carrefours du réseau routier accessible en voiture comptent :
// les maillages de places et trottoirs ne génèrent plus de points. Exception
// géométrique : un nœud situé à l'intérieur d'un contour d'espace vert
// (parc, jardin, forêt, terrain de sport) est toujours traité en mode
// "rural" (toutes ses branches comptent), même si la zone environnante est
// par ailleurs classée urbaine. En environnement rural, les sentiers et
// chemins SONT le réseau principal, donc toutes les voies piétonnes
// comptent (règle d'origine).

// Contrairement à la version client, pas de yieldToEventLoop() entre les
// étapes : ça n'a de sens que pour ne pas geler un thread UI, absent ici.
// Mesuré (script de mesure, voir plan Phase 1) : ~110-150ms même sur une
// zone dense (Paris/Châtelet, ~1900 ways) à RADIUS=500 — largement dans le
// budget CPU d'une Edge Function (2s).
import { lineLength, pointAtFraction, haversine, pointInPolygon, ringBBox } from './geo.ts';

const STUB_MAX = 30;    // impasse plus courte que ça -> branche non significative (m)
const LINK_MAX = 25;    // arête plus courte entre deux carrefours -> fusion (m)
const CLUSTER_MAX = 60; // diagonale maximale d'un carrefour consolidé (m)

// Voies "principales" accessibles en voiture (service, track, chemins exclus).
const CAR_HIGHWAYS = new Set([
  'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
]);
const DENSITY_CELL = 250;    // taille des cellules de la grille de densité (m)
const URBAN_MIN_ROAD = 2200; // urbain si >= ce total de voirie carrossable (m)
                             // dans la fenêtre 3x3 autour du nœud (750 m de côté)

export function nodeKey(c: [number, number]): string {
  return c[0].toFixed(6) + ',' + c[1].toFixed(6);
}

function coordKey5(c: [number, number]): string {
  return c[0].toFixed(5) + ',' + c[1].toFixed(5);
}

// ID stable : extrémités triées + point milieu géométrique + longueur arrondie.
// Le milieu distingue deux arêtes parallèles reliant les mêmes extrémités.
function edgeId(coords: [number, number][], length: number): string {
  const a = coordKey5(coords[0]);
  const b = coordKey5(coords[coords.length - 1]);
  const mid = coordKey5(pointAtFraction(coords, 0.5));
  const ends = a < b ? a + '|' + b : b + '|' + a;
  return ends + '|' + mid + '|' + Math.round(length);
}

interface OsmWay {
  id: number;
  nodes: number[];
  tags: Record<string, string>;
}

interface OsmData {
  nodes: Map<number, [number, number]>;
  ways: OsmWay[];
}

export async function buildGraph(osm: OsmData, greenAreas: [number, number][][] = []) {
  // Filtre rapide par bbox avant le test point-dans-polygone, plus coûteux.
  const greenPolys = greenAreas.map((ring) => ({ ring, bbox: ringBBox(ring) }));
  const inGreenArea = (lat: number, lon: number) =>
    greenPolys.some(
      ({ ring, bbox }) =>
        lat >= bbox.minLat &&
        lat <= bbox.maxLat &&
        lon >= bbox.minLon &&
        lon <= bbox.maxLon &&
        pointInPolygon([lat, lon], ring)
    );

  // 0. Attributs par paire de nœuds consécutifs (carrossable, sens unique,
  //    rond-point, passage piéton) : permet de retrouver, après
  //    découpage/fusion, les attributs de chaque arête finale.
  const pairKey = (a: number, b: number) => (a < b ? a + ':' + b : b + ':' + a);
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

  // 1. Un nœud est une jonction s'il apparaît au moins 2 fois (dans plusieurs
  //    ways, ou deux fois dans un way fermé).
  const usage = new Map<number, number>();
  for (const w of osm.ways) {
    for (const nid of w.nodes) usage.set(nid, (usage.get(nid) || 0) + 1);
  }
  const isJunction = (nid: number) => (usage.get(nid) || 0) >= 2;

  // 2. Découpage des ways aux jonctions.
  const all: { nodes: number[]; dead: boolean }[] = [];
  for (const w of osm.ways) {
    let start = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      if (i === w.nodes.length - 1 || isJunction(w.nodes[i])) {
        all.push({ nodes: w.nodes.slice(start, i + 1), dead: false });
        start = i;
      }
    }
  }

  // 3. Fusion des nœuds de degré 2 (artefacts de découpage OSM).
  const adj = new Map<number, { nodes: number[]; dead: boolean }[]>();
  const addAdj = (nid: number, seg: { nodes: number[]; dead: boolean }) => {
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
      const merged = { nodes: n1.concat(n2.slice(1)), dead: false };
      s1.dead = true;
      s2.dead = true;
      adj.set(nid, []);
      all.push(merged);
      addAdj(merged.nodes[0], merged);
      addAdj(merged.nodes[merged.nodes.length - 1], merged);
      changed = true;
    }
  }

  // 4. Structures finales : arêtes et nœuds.
  const edges = new Map<string, any>(); // id -> { id, coords, length, a, b }
  const nodes = new Map<string, any>(); // key -> { key, lat, lon, edgeIds }
  for (const s of all) {
    if (s.dead) continue;
    const coords = s.nodes.map((nid) => osm.nodes.get(nid)).filter(Boolean) as [number, number][];
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
    const e = {
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
    for (const [key, c] of [[e.a, coords[0]] as const, [e.b, coords[coords.length - 1]] as const]) {
      let n = nodes.get(key);
      if (!n) nodes.set(key, (n = { key, lat: c[0], lon: c[1], edgeIds: [] as string[] }));
      n.edgeIds.push(id);
    }
  }

  // 5a. Classification urbain/rural : densité locale de voirie carrossable,
  //     accumulée dans une grille de cellules de 250 m (fenêtre 3x3 lissée).
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
      const mid: [number, number] = [(e.coords[i - 1][0] + e.coords[i][0]) / 2, (e.coords[i - 1][1] + e.coords[i][1]) / 2];
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

  // 5b. Branches significatives : une impasse courte (entrée de bâtiment,
  //     allée de garage) ne compte ni dans le degré, ni dans la complétion.
  //     En zone urbaine, seules les branches carrossables comptent.
  const isStubFor = (e: any, key: string) => {
    const other = e.a === key ? e.b : e.a;
    if (other === key) return e.length < STUB_MAX; // boucle courte sur le nœud
    return e.length < STUB_MAX && nodes.get(other).edgeIds.length === 1;
  };

  // `sigEdges` est retenu pour TOUS les nœuds, pas seulement les candidats :
  // l'étape 6 s'en sert pour décider si une chaîne traverse un nœud (deux
  // branches significatives) ou s'y arrête (une seule, ou trois et plus).
  const candidates = new Set<string>(); // nœuds avec >= 3 branches significatives
  const urbanNode = new Map<string, boolean>();  // key -> bool (mode retenu pour ce nœud)
  const sigEdges = new Map<string, string[]>();  // key -> branches significatives
  for (const n of nodes.values()) {
    const urban = isUrban(n.lat, n.lon) && !inGreenArea(n.lat, n.lon);
    const pool = urban ? n.edgeIds.filter((id: string) => edges.get(id).car) : n.edgeIds;
    const sig = pool.filter((id: string) => !isStubFor(edges.get(id), n.key));
    urbanNode.set(n.key, urban);
    sigEdges.set(n.key, sig);
    if (sig.length >= 3) candidates.add(n.key);
  }

  // 5c. Consolidation : union-find des candidats reliés par une arête courte,
  //     avec plafond de taille pour ne pas avaler un maillage de place entière.
  //     On ne fusionne que si le lien est un artefact de cartographie d'UN
  //     SEUL carrefour réel : arc de rond-point, segment à sens unique
  //     (chaussées séparées, bretelles), traversée piétonne (îlot, terre-plein)
  //     ou nœud posé sur des chaussées séparées (>= 2 branches à sens unique).
  //     Un tronçon de rue normale à double sens ne fusionne jamais : deux
  //     intersections décalées le long d'un même axe restent deux carrefours
  //     distincts, chacun avec ses propres branches à parcourir.
  const onewayHub = new Set<string>();
  for (const n of nodes.values()) {
    let ow = 0;
    for (const id of n.edgeIds) {
      const e = edges.get(id);
      if (e.car && e.oneway) ow++;
    }
    if (ow >= 2) onewayHub.add(n.key);
  }
  const isArtifactLink = (e: any) =>
    e.roundabout ||
    (e.car && e.oneway) ||
    (!e.car && e.crossing) ||
    onewayHub.has(e.a) ||
    onewayHub.has(e.b);
  const parent = new Map<string, string>();
  const bbox = new Map<string, { minLat: number; maxLat: number; minLon: number; maxLon: number }>();
  for (const key of candidates) {
    parent.set(key, key);
    const n = nodes.get(key);
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
    const m = {
      minLat: Math.min(A.minLat, B.minLat),
      maxLat: Math.max(A.maxLat, B.maxLat),
      minLon: Math.min(A.minLon, B.minLon),
      maxLon: Math.max(A.maxLon, B.maxLon),
    };
    if (haversine([m.minLat, m.minLon], [m.maxLat, m.maxLon]) > CLUSTER_MAX) continue;
    parent.set(ra, rb);
    bbox.set(rb, m);
  }

  const clusters = new Map<string, string[]>(); // racine -> [keys]
  for (const key of candidates) {
    const r = find(key);
    let list = clusters.get(r);
    if (!list) clusters.set(r, (list = []));
    list.push(key);
  }

  // 5d. Carrefours consolidés. Le test de rétention (>= 3 branches externes
  //     significatives) porte sur les ARÊTES DE BASE, comme avant l'arrivée
  //     des tronçons : ce qui fait un carrefour n'a pas changé. Ce que le
  //     carrefour exige pour être complété, si — c'est l'étape 7.
  //     Un groupe est urbain dès qu'un de ses membres l'est : seules ses
  //     branches carrossables comptent alors.
  const junctions = new Map<string, any>();     // id -> { id, lat, lon, members, requiredEdgeIds }
  const junctionUrban = new Map<string, boolean>(); // hors du carrefour lui-même : pas dans le payload
  for (const members of clusters.values()) {
    const memberSet = new Set(members);
    const urban = members.some((key) => urbanNode.get(key));
    const required = new Set<string>();
    for (const key of members) {
      for (const id of nodes.get(key).edgeIds) {
        const e = edges.get(id);
        if (urban && !e.car) continue;
        if (memberSet.has(e.a) && memberSet.has(e.b)) continue; // interne
        if (isStubFor(e, key)) continue;
        required.add(id);
      }
    }
    if (required.size < 3) continue; // pas un vrai carrefour

    members.sort();
    const id = members[0]; // clé stable : plus petit nœud membre
    let lat = 0;
    let lon = 0;
    for (const key of members) {
      const n = nodes.get(key);
      lat += n.lat;
      lon += n.lon;
    }
    junctions.set(id, {
      id,
      lat: lat / members.length,
      lon: lon / members.length,
      members,
      requiredEdgeIds: new Set<string>(), // rempli à l'étape 7, en tronçons
    });
    junctionUrban.set(id, urban);
  }

  // 6. Tronçons : chaînes d'arêtes de base entre deux carrefours (voir la
  //    règle en tête de fichier). Le parcours part de chaque branche
  //    significative d'un carrefour et avance tant que le nœud atteint n'est
  //    pas un carrefour et n'a que deux branches significatives, dont celle
  //    par laquelle on arrive — sinon il n'y a pas de continuation unique.
  //    Chaque chaîne est trouvée deux fois (une par extrémité) : `consommees`
  //    garde la première et jette la seconde. L'identifiant, lui, ne dépend
  //    pas du sens de parcours (extrémités triées, voir edgeId).
  const carrefourNodes = new Set<string>();
  for (const j of junctions.values()) for (const key of j.members) carrefourNodes.add(key);

  const autreBout = (e: any, key: string) => (e.a === key ? e.b : e.a);

  const troncons = new Map<string, any>();
  const consommees = new Set<string>();
  for (const depart of carrefourNodes) {
    for (const premiere of sigEdges.get(depart) || []) {
      if (consommees.has(premiere)) continue;

      const chaine = [premiere];
      const vues = new Set(chaine);
      let courante = premiere;
      let bout = autreBout(edges.get(premiere), depart);
      let arrivee: string | null = null;
      while (true) {
        // Le test du carrefour passe AVANT celui des branches
        // significatives : une branche peut être significative d'un côté et
        // pas de l'autre (impasse courte, filtre carrossable d'un nœud
        // urbain), et une chaîne qui touche un carrefour est un tronçon quoi
        // qu'il arrive.
        if (carrefourNodes.has(bout)) {
          arrivee = bout;
          break;
        }
        const sig = sigEdges.get(bout) || [];
        if (sig.length !== 2 || sig.indexOf(courante) < 0) break;
        const suivante = sig[0] === courante ? sig[1] : sig[0];
        if (vues.has(suivante)) break; // boucle refermée sur elle-même
        chaine.push(suivante);
        vues.add(suivante);
        bout = autreBout(edges.get(suivante), bout);
        courante = suivante;
      }
      if (arrivee === null) continue; // impasse ou fourche : pas un tronçon

      let coords: [number, number][] = [];
      let curseur = depart;
      for (const eid of chaine) {
        const e = edges.get(eid);
        const c: [number, number][] = e.a === curseur ? e.coords : e.coords.slice().reverse();
        curseur = autreBout(e, curseur);
        coords = coords.length ? coords.concat(c.slice(1)) : c.slice();
      }
      const length = lineLength(coords);
      if (length < 1) continue;

      for (const eid of chaine) consommees.add(eid);
      const id = edgeId(coords, length);
      if (troncons.has(id)) continue;

      // Attributs de la chaîne : majorité pondérée par la longueur, même
      // règle que pour une arête de base (une rue majoritairement carrossable
      // reste carrossable même si elle traverse un passage piéton).
      let carLen = 0;
      let onewayLen = 0;
      let roundLen = 0;
      let crossLen = 0;
      for (const eid of chaine) {
        const e = edges.get(eid);
        if (e.car) carLen += e.length;
        if (e.oneway) onewayLen += e.length;
        if (e.roundabout) roundLen += e.length;
        if (e.crossing) crossLen += e.length;
      }
      troncons.set(id, {
        id,
        coords,
        length,
        car: carLen / length >= 0.5,
        oneway: onewayLen / length >= 0.5,
        roundabout: roundLen / length >= 0.5,
        crossing: crossLen / length >= 0.5,
        a: nodeKey(coords[0]),
        b: nodeKey(coords[coords.length - 1]),
      });
    }
  }

  // 7. Ce que chaque carrefour exige, en tronçons. Les micro-arêtes internes
  //    au carrefour (passages piétons, arcs de rond-point) restent exclues,
  //    et les impasses n'existent plus pour l'exiger.
  const tronconsParNoeud = new Map<string, string[]>();
  for (const t of troncons.values()) {
    for (const key of new Set<string>([t.a, t.b])) {
      let list = tronconsParNoeud.get(key);
      if (!list) tronconsParNoeud.set(key, (list = []));
      list.push(t.id);
    }
  }

  const edgeJunctions = new Map<string, string[]>(); // tronçonId -> [junctionId]
  for (const [jid, j] of junctions) {
    const memberSet = new Set<string>(j.members);
    const urban = junctionUrban.get(jid);
    const required = new Set<string>();
    for (const key of j.members) {
      for (const tid of tronconsParNoeud.get(key) || []) {
        const t = troncons.get(tid);
        if (memberSet.has(t.a) && memberSet.has(t.b)) continue; // interne
        if (urban && !t.car) continue;
        required.add(tid);
      }
    }
    // Un carrefour dont toutes les branches menaient à des impasses n'a plus
    // rien à exiger : il serait complété d'office, donc offert. Rare (il
    // faudrait trois branches sans issue), mais un point gratuit se verrait.
    if (required.size === 0) {
      junctions.delete(jid);
      continue;
    }
    j.requiredEdgeIds = required;
    for (const tid of required) {
      let list = edgeJunctions.get(tid);
      if (!list) edgeJunctions.set(tid, (list = []));
      list.push(jid);
    }
  }

  return { nodes, edges: troncons, junctions, edgeJunctions };
}
