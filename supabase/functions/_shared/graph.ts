// Construction du graphe de jeu — implémentation des sections 1 et 2 de la
// spécification « points d'intersection, tronçons et suivi GPS »
// (docs/spec-points-troncons-gps.md).
//
// Seul exemplaire depuis la bascule du client sur l'Edge Function : le client
// ne construit plus rien, il fusionne des zones déjà construites (voir
// mobile/src/logic/region.ts). Toute modification ici change les IDs de
// tronçons/points servis, donc invalide la progression déjà enregistrée par
// les joueurs — bumper VERSION dans get-region/index.ts.
//
// Vocabulaire de la spécification, repris tel quel dans le code :
//   - POINT D'INTERSECTION (« point ») : nœud interactif du graphe,
//     correspondant à une vraie jonction physique. C'est ce que le joueur
//     atteint (< 5 m, voir le suivi GPS côté client) et ce qui rapporte.
//   - TRONÇON : lien entre deux points ADJACENTS, sans aucun autre point sur
//     le trajet. Plusieurs tronçons peuvent relier les deux mêmes points
//     (B1) : ils coexistent comme entités distinctes.
//
// Étapes :
//   1. repérage des nœuds de jonction (partagés par plusieurs ways),
//   2. découpage des ways en segments entre jonctions,
//   3. fusion des chaînes de degré 2 : un vertex de géométrie pure (celui qui
//      ne fait que dessiner la courbure d'une rue) disparaît — A1,
//   4. identifiants d'arêtes de base stables, dérivés de la géométrie,
//   5. classement de zone (A3 : urbain / parc-forêt / rural) puis branches
//      significatives (A4 : impasse courte ignorée),
//   6. points d'intersection : nœuds à >= 3 branches significatives, groupés
//      par proximité mutuelle (A2 : < 5 m -> un seul point, au barycentre),
//   7. tronçons : chaînes d'arêtes de base entre deux points (B0), tous les
//      candidats d'une même paire conservés (B1),
//   8. branches de chaque point, en tronçons.
//
// A5 (infrastructures non praticables) est traité en amont, dans la requête
// Overpass (_shared/overpass.ts) : seules des ways `highway=...` sont
// demandées, donc une voie de tram ou une voie ferrée n'apporte aucun nœud et
// ne peut pas créer de point, même là où elle croise visuellement une rue.
//
// Limite connue, héritée de la découpe en zones : le graphe est tronqué au
// BUILD_RADIUS (voir get-region/index.ts), ce qui fabrique de fausses
// impasses sur le bord. Une chaîne qui les atteint est abandonnée, alors que
// la zone voisine la verrait entière. La marge de construction (1000 m
// construits pour 550 m servis) garde ce cas hors de ce qui est réellement
// servi tant qu'un tronçon reste sous ~900 m.
//
// Contrairement à la version client d'origine, pas de yieldToEventLoop()
// entre les étapes : ça n'a de sens que pour ne pas geler un thread UI,
// absent ici. Mesuré : ~110-150 ms même sur une zone dense (Paris/Châtelet,
// ~1900 ways) — largement dans le budget CPU d'une Edge Function (2 s).
import { lineLength, pointAtFraction, haversine, pointInPolygon, ringBBox } from './geo.ts';

// ------------------------------------------------------- paramètres (§6 de la spéc)

// A2 — rayon de consolidation des nœuds OSM fragmentés. Deux nœuds qui
// décrivent la même jonction physique (une voie et un chemin piéton taggés
// séparément, des coordonnées légèrement décalées) fusionnent en un seul
// point de jeu. Valeur validée par la spécification.
//
// Conséquence assumée du passage de l'ancienne règle (25 m + heuristique
// « lien artefact ») à ces 5 m : un carrefour cartographié en chaussées
// séparées, avec îlots et passages piétons, produit maintenant PLUSIEURS
// points au lieu d'un seul. Ce n'est plus le problème que c'était : un point
// s'acquiert en passant à moins de 5 m (règle C2), il n'exige plus d'avoir
// parcouru toutes ses branches. Si les tests terrain montrent que ça dilue
// trop le comptage, c'est ce paramètre qu'il faut remonter.
export const NODE_MERGE_RADIUS_M = 5;

// A4 — longueur en dessous de laquelle une impasse (antenne de desserte,
// entrée de bâtiment, allée de garage) n'est pas une branche significative :
// elle ne compte ni dans le degré d'un nœud, ni comme tronçon.
// DÉCISION OUVERTE dans la spécification : valeur à trancher après tests
// terrain. 30 m est la valeur héritée du prototype, conservée par défaut.
export const DEAD_END_MAX_LENGTH_M = 30;

// A3 — classement de zone. `landuse` résidentiel/commercial fait foi quand il
// est cartographié ; la densité locale de voirie carrossable sert de repli
// (beaucoup de communes n'ont aucun `landuse` en base).
const DENSITY_CELL = 250;    // taille des cellules de la grille de densité (m)
const URBAN_MIN_ROAD = 2200; // urbain si >= ce total de voirie carrossable (m)
                             // dans la fenêtre 3x3 autour du nœud (750 m de côté)

// Voies "principales" accessibles en voiture (service, track, chemins exclus).
const CAR_HIGHWAYS = new Set([
  'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
]);

// Voies piétonnes « principales » au sens d'A3 : une rue piétonne est une voie
// structurante du réseau urbain, au même titre qu'une rue carrossable. Les
// trottoirs, passages et sentiers de desserte n'en sont pas — ce sont eux que
// la règle urbaine écarte.
const MAIN_PEDESTRIAN_HIGHWAYS = new Set(['pedestrian']);

export type ZoneType = 'urbain' | 'parc' | 'rural';

export function nodeKey(c: [number, number]): string {
  return c[0].toFixed(6) + ',' + c[1].toFixed(6);
}

function coordKey5(c: [number, number]): string {
  return c[0].toFixed(5) + ',' + c[1].toFixed(5);
}

// ID stable : extrémités triées + point milieu géométrique + longueur arrondie.
// Le milieu distingue deux tronçons parallèles reliant les mêmes points (B1).
// Volontairement dérivé de la seule géométrie OSM : ni des IDs OSM (qui
// changent), ni du groupement des points (qui dépend, lui, des données
// disponibles localement et serait donc moins stable d'une zone à l'autre).
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

// `greenAreas` : contours de parcs/forêts (A3, régime « tous les carrefours de
// chemins comptent »). `urbanAreas` : contours `landuse` résidentiel/
// commercial (A3, régime urbain standard).
//
// `options` : les deux paramètres que la spécification laisse réglables (§6).
// La production ne les passe jamais — elle prend les valeurs par défaut
// ci-dessus. Ils existent pour que les tests terrain puissent BALAYER ces
// valeurs sans toucher au code (voir scripts/inspect-points.mjs), ce que
// demandent explicitement les deux décisions restées ouvertes.
export interface BuildOptions {
  nodeMergeRadiusM?: number;   // A2
  deadEndMaxLengthM?: number;  // A4
}

export async function buildGraph(
  osm: OsmData,
  greenAreas: [number, number][][] = [],
  urbanAreas: [number, number][][] = [],
  options: BuildOptions = {}
) {
  const rayonFusion = options.nodeMergeRadiusM ?? NODE_MERGE_RADIUS_M;
  const impasseMax = options.deadEndMaxLengthM ?? DEAD_END_MAX_LENGTH_M;
  // Filtre rapide par bbox avant le test point-dans-polygone, plus coûteux.
  const prepare = (rings: [number, number][][]) => rings.map((ring) => ({ ring, bbox: ringBBox(ring) }));
  const inAny = (polys: { ring: [number, number][]; bbox: ReturnType<typeof ringBBox> }[], lat: number, lon: number) =>
    polys.some(
      ({ ring, bbox }) =>
        lat >= bbox.minLat &&
        lat <= bbox.maxLat &&
        lon >= bbox.minLon &&
        lon <= bbox.maxLon &&
        pointInPolygon([lat, lon], ring)
    );
  const greenPolys = prepare(greenAreas);
  const urbanPolys = prepare(urbanAreas);

  // 0. Attributs par paire de nœuds consécutifs (carrossable, rue piétonne) :
  //    permet de retrouver, après découpage/fusion, la nature de chaque arête
  //    de base — c'est elle qui décide du régime de zone (A3) et des branches
  //    significatives.
  const pairKey = (a: number, b: number) => (a < b ? a + ':' + b : b + ':' + a);
  const carPairs = new Set<string>();
  const walkPairs = new Set<string>();
  for (const w of osm.ways) {
    const t = w.tags;
    const car = CAR_HIGHWAYS.has(t.highway);
    const walk = MAIN_PEDESTRIAN_HIGHWAYS.has(t.highway);
    if (!car && !walk) continue;
    for (let i = 1; i < w.nodes.length; i++) {
      const k = pairKey(w.nodes[i - 1], w.nodes[i]);
      if (car) carPairs.add(k);
      if (walk) walkPairs.add(k);
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

  // 3. Fusion des chaînes de degré 2 (A1 : un vertex de géométrie pure ne
  //    génère aucun point ; ici il ne génère même plus de nœud de graphe).
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

  // 4. Structures intermédiaires : arêtes de base et nœuds. Ce ne sont PAS
  //    encore des tronçons — une arête de base s'arrête à tout nœud partagé
  //    par plusieurs ways (entrée de parking, trottoir qui rejoint la
  //    chaussée), donc bien avant le point d'intersection suivant.
  const edges = new Map<string, any>(); // id -> { id, coords, length, a, b, ... }
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
    let walkLen = 0;
    for (let i = 1; i < s.nodes.length; i++) {
      const k = pairKey(s.nodes[i - 1], s.nodes[i]);
      const ca = osm.nodes.get(s.nodes[i - 1]);
      const cb = osm.nodes.get(s.nodes[i]);
      if (!ca || !cb) continue;
      const d = haversine(ca, cb);
      if (carPairs.has(k)) carLen += d;
      if (walkPairs.has(k)) walkLen += d;
    }
    // Majorité pondérée par la longueur : une rue majoritairement carrossable
    // reste carrossable même si elle traverse un passage piéton.
    const e = {
      id,
      coords,
      length,
      car: carLen / length >= 0.5,
      walk: walkLen / length >= 0.5,
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

  // 5a. A3 — classement de zone. Densité locale de voirie carrossable,
  //     accumulée dans une grille de cellules de 250 m (fenêtre 3x3 lissée),
  //     utilisée en repli du `landuse`.
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
  const isDense = (lat: number, lon: number) => {
    const cx = Math.floor((lon * kx) / DENSITY_CELL);
    const cy = Math.floor((lat * ky) / DENSITY_CELL);
    let sum = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) sum += density.get(cx + dx + ':' + (cy + dy)) || 0;
    }
    return sum >= URBAN_MIN_ROAD;
  };

  // Le régime « parc » l'emporte sur le régime urbain : c'est exactement le
  // cas d'un parc au milieu d'une ville, où toutes les bifurcations de
  // sentiers comptent (A3, second point).
  const zoneOf = (lat: number, lon: number): ZoneType => {
    if (inAny(greenPolys, lat, lon)) return 'parc';
    if (inAny(urbanPolys, lat, lon) || isDense(lat, lon)) return 'urbain';
    return 'rural';
  };

  // 5b. A4 — branches significatives. Une impasse plus courte que
  //     DEAD_END_MAX_LENGTH_M ne compte pas : elle ne fait pas d'un nœud une
  //     jonction, et son point de rebroussement (degré 1) n'est de toute
  //     façon jamais un point.
  //     A3 — en zone urbaine standard, seules les voies carrossables et les
  //     rues piétonnes comptent : les entrées de commerces, courettes et
  //     maillages de trottoirs ne génèrent aucun point.
  const isDeadEndStub = (e: any, key: string) => {
    const other = e.a === key ? e.b : e.a;
    if (other === key) return e.length < impasseMax; // boucle courte sur le nœud
    return e.length < impasseMax && nodes.get(other).edgeIds.length === 1;
  };

  // `sigEdges` est retenu pour TOUS les nœuds, pas seulement les candidats :
  // l'étape 7 s'en sert pour décider si une chaîne traverse un nœud (deux
  // branches significatives) ou s'y arrête (une seule, ou trois et plus).
  const candidates: string[] = [];              // nœuds à >= 3 branches significatives
  const sigEdges = new Map<string, string[]>(); // key -> branches significatives
  for (const n of nodes.values()) {
    const zone = zoneOf(n.lat, n.lon);
    const pool =
      zone === 'urbain' ? n.edgeIds.filter((id: string) => edges.get(id).car || edges.get(id).walk) : n.edgeIds;
    const sig = pool.filter((id: string) => !isDeadEndStub(edges.get(id), n.key));
    sigEdges.set(n.key, sig);
    if (sig.length >= 3) candidates.push(n.key);
  }

  // 6. A2 — consolidation. Tout groupe de nœuds candidats dont les
  //    coordonnées sont MUTUELLEMENT à moins de NODE_MERGE_RADIUS_M devient un
  //    seul point de jeu, placé au barycentre du groupe.
  //
  //    « Mutuellement » est pris au pied de la lettre : un candidat rejoint un
  //    groupe seulement s'il est à moins de 5 m de TOUS ses membres déjà
  //    retenus. Sans ça, une chaîne de nœuds espacés de 4 m se propagerait de
  //    proche en proche et avalerait une place entière.
  //
  //    L'ordre de parcours est trié : deux zones voisines qui voient le même
  //    voisinage doivent former les mêmes groupes, sinon les points changent
  //    d'identité au recouvrement.
  candidates.sort();
  const cellSize = rayonFusion;
  const cellIndex = new Map<string, string[]>();
  const cellOf = (lat: number, lon: number) =>
    Math.floor((lon * kx) / cellSize) + ':' + Math.floor((lat * ky) / cellSize);
  for (const key of candidates) {
    const n = nodes.get(key);
    const c = cellOf(n.lat, n.lon);
    let list = cellIndex.get(c);
    if (!list) cellIndex.set(c, (list = []));
    list.push(key);
  }
  const voisinage = (key: string): string[] => {
    const n = nodes.get(key);
    const cx = Math.floor((n.lon * kx) / cellSize);
    const cy = Math.floor((n.lat * ky) / cellSize);
    const out: string[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of cellIndex.get(cx + dx + ':' + (cy + dy)) || []) {
          if (other !== key) out.push(other);
        }
      }
    }
    return out.sort();
  };

  const groupeDe = new Map<string, string[]>(); // key membre -> groupe
  const groupes: string[][] = [];
  for (const key of candidates) {
    if (groupeDe.has(key)) continue;
    const groupe = [key];
    const n = nodes.get(key);
    for (const other of voisinage(key)) {
      if (groupeDe.has(other)) continue;
      const o = nodes.get(other);
      if (haversine([n.lat, n.lon], [o.lat, o.lon]) >= rayonFusion) continue;
      const compatible = groupe.every((m) => {
        const mm = nodes.get(m);
        return haversine([mm.lat, mm.lon], [o.lat, o.lon]) < rayonFusion;
      });
      if (!compatible) continue;
      groupe.push(other);
    }
    groupe.sort();
    groupes.push(groupe);
    for (const m of groupe) groupeDe.set(m, groupe);
  }

  // Points d'intersection retenus. Le test (>= 3 branches significatives
  // EXTERNES au groupe) porte sur les arêtes de base : c'est la définition
  // d'une vraie jonction (A1), indépendante du recollage en tronçons.
  const points = new Map<string, any>(); // id -> { id, lat, lon, members, branchEdgeIds }
  const pointDuNoeud = new Map<string, string>(); // key membre -> id du point
  for (const members of groupes) {
    const memberSet = new Set(members);
    const branchesDeBase = new Set<string>();
    for (const key of members) {
      for (const id of sigEdges.get(key) || []) {
        const e = edges.get(id);
        if (memberSet.has(e.a) && memberSet.has(e.b)) continue; // interne au groupe
        branchesDeBase.add(id);
      }
    }
    if (branchesDeBase.size < 3) continue; // pas une vraie jonction

    const id = members[0]; // clé stable : plus petit nœud membre
    let lat = 0;
    let lon = 0;
    for (const key of members) {
      const n = nodes.get(key);
      lat += n.lat;
      lon += n.lon;
    }
    points.set(id, {
      id,
      lat: lat / members.length, // A2 : barycentre du groupe
      lon: lon / members.length,
      members,
      branchEdgeIds: new Set<string>(), // rempli à l'étape 8, en tronçons
    });
    for (const key of members) pointDuNoeud.set(key, id);
  }

  // 7. B0/B1 — tronçons. Chaîne d'arêtes de base partant d'une branche
  //    significative d'un point, poursuivie tant que le nœud atteint n'est pas
  //    un point ET n'a que deux branches significatives (dont celle par
  //    laquelle on arrive), retenue seulement si elle aboutit à un point.
  //
  //    Une chaîne qui n'aboutit nulle part (impasse, bord de zone) ou qui bute
  //    sur une fourche qui n'est pas un point est abandonnée : il n'y a pas de
  //    continuation évidente à un embranchement. Les impasses ne sont donc pas
  //    des tronçons — ni au comptage, ni sur la carte.
  //
  //    B1 : deux chaînes distinctes reliant les deux mêmes points (les deux
  //    branches d'une boucle de desserte, les deux côtés d'un rond-point) sont
  //    deux tronçons distincts, avec deux identifiants distincts — le point
  //    milieu entre dans l'identifiant, justement pour ça.
  //
  //    Chaque chaîne est trouvée deux fois (une par extrémité) : `consommees`
  //    garde la première et jette la seconde.
  const autreBout = (e: any, key: string) => (e.a === key ? e.b : e.a);

  const troncons = new Map<string, any>();
  const consommees = new Set<string>();
  const departs = [...pointDuNoeud.keys()].sort();
  for (const depart of departs) {
    for (const premiere of sigEdges.get(depart) || []) {
      if (consommees.has(premiere)) continue;

      const chaine = [premiere];
      const vues = new Set(chaine);
      let courante = premiere;
      let bout = autreBout(edges.get(premiere), depart);
      let arrivee: string | null = null;
      while (true) {
        // Le test du point passe AVANT celui des branches significatives :
        // une branche peut être significative d'un côté et pas de l'autre
        // (impasse courte, filtre urbain), et une chaîne qui touche un point
        // est un tronçon quoi qu'il arrive.
        if (pointDuNoeud.has(bout)) {
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

      // Chaîne qui revient sur le point dont elle est partie (boucle refermée,
      // ou lien interne entre deux nœuds consolidés du même point) : ce n'est
      // pas un lien entre DEUX points (B0), et la validation par consécutivité
      // ne peut rien en faire — deux passages au même point ne disent pas par
      // où on est passé entre les deux. La chaîne est marquée consommée pour
      // ne pas être reparcourue depuis l'autre bout, puis abandonnée : mieux
      // vaut ne pas l'afficher du tout que la laisser « à relever » à jamais.
      if (pointDuNoeud.get(arrivee) === pointDuNoeud.get(depart)) {
        for (const eid of chaine) consommees.add(eid);
        continue;
      }

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

      // Pas d'attributs (carrossable, sens unique, passage piéton…) sur le
      // tronçon : ils ne servaient qu'à l'ancienne heuristique de
      // consolidation, remplacée par la règle des 5 m (A2), et personne ne les
      // lit côté client. Les traîner coûtait ~180 Ko de payload sur une zone
      // dense. Ils restent portés par les ARÊTES DE BASE, qui en ont besoin
      // pour le classement de zone et les branches significatives.
      troncons.set(id, {
        id,
        coords,
        length,
        a: nodeKey(coords[0]),
        b: nodeKey(coords[coords.length - 1]),
        // Les deux points reliés : c'est sur cette paire que la validation
        // par consécutivité travaille côté client (D1/D3).
        ja: pointDuNoeud.get(depart)!,
        jb: pointDuNoeud.get(arrivee)!,
      });
    }
  }

  // 8. Branches de chaque point, en tronçons.
  //
  //    Aucun filtre urbain ici, à la différence du degré (étape 5b) : ce qui
  //    FAIT un point, c'est son voisinage carrossable ; ce qu'il MONTRE, ce
  //    sont tous les tronçons qui en partent. Un tronçon est donc toujours
  //    branche de ses deux extrémités, ce qui garantit qu'aucun tronçon ne se
  //    retrouve orphelin d'un de ses points.
  for (const t of troncons.values()) {
    points.get(t.ja)?.branchEdgeIds.add(t.id);
    points.get(t.jb)?.branchEdgeIds.add(t.id);
  }

  // Un point dont toutes les branches menaient à des impasses n'a aucun
  // tronçon : il serait atteignable sans jamais relier quoi que ce soit —
  // un point gratuit, isolé du réseau. Rare (il faudrait trois branches sans
  // issue), mais il se verrait.
  //
  // Invariant de la spécification (B0) : après ce nettoyage, tout tronçon
  // relie encore DEUX points retenus. C'est acquis sans nouvelle passe — un
  // point supprimé n'avait aucun tronçon incident, et les boucles sur un même
  // point ont déjà été écartées à l'étape 7.
  for (const [id, p] of [...points]) {
    if (p.branchEdgeIds.size === 0) points.delete(id);
  }

  return { nodes, edges: troncons, junctions: points };
}
