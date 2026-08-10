// Géométrie de ce que le joueur a découvert, conservée localement pour
// pouvoir la dessiner SANS attendre le serveur.
//
// `progress` (storage.ts) mémorise déjà l'identité de ce qui est acquis : IDs
// des tronçons parcourus, des carrefours complétés, compteurs de passages
// pour la heatmap. Mais dessiner demande la géométrie — la polyligne d'un
// tronçon, la position d'un carrefour — et celle-ci n'existait que dans
// `state.graph`, c'est-à-dire uniquement pour les zones chargées depuis
// l'Edge Function pendant la session en cours. D'où le symptôme : au
// lancement la carte est vide tant qu'une zone n'est pas arrivée, et un
// quartier parcouru le mois dernier reste vide tant qu'on n'a pas rechargé
// sa zone.
//
// Ce magasin est volontairement SÉPARÉ de `progress` : la progression est
// réécrite en entier à chaque tronçon découvert (voir persist() dans
// useWalkedia, appelé depuis la boucle GPS), et y ajouter la géométrie
// doublerait le volume réécrit à chaque pas. Ici l'écriture est différée et
// regroupée (voir scheduleSave).
//
// Non synchronisé avec Supabase, à la différence de `progress` : c'est de la
// donnée dérivée, reconstructible depuis n'importe quelle zone rechargée
// (voir le rattrapage dans applyRegion). Sur un nouvel appareil, la
// progression revient du compte mais la géométrie se remplit au fil des
// zones visitées.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'walkedia-geom-v1';

// Mesuré sur une zone dense (Paris/Châtelet, 2662 tronçons) : ~133 octets par
// tronçon, soit 347 Ko pour une zone entièrement découverte, et les carrefours
// sont négligeables (6 Ko pour 152). AsyncStorage sous Android a un plafond
// global par défaut de 6 Mo : on borne donc le nombre de tronçons conservés,
// en abandonnant les moins récemment parcourus (voir prune).
const MAX_EDGES = 20000; // ~2,7 Mo

export interface DiscoveredEdge {
  coords: [number, number][];
  length: number;
  at: number; // ms epoch du dernier enregistrement, sert au tri de prune()
}

export interface Discovered {
  edges: Map<string, DiscoveredEdge>;
  junctions: Map<string, [number, number]>; // id -> [lat, lon]
}

export function fresh(): Discovered {
  return { edges: new Map(), junctions: new Map() };
}

export async function load(): Promise<Discovered> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw);
    return {
      edges: new Map(
        (data.edges || []).map(([id, coords, length, at]: [string, [number, number][], number, number]) => [
          id,
          { coords, length, at: at || 0 },
        ])
      ),
      junctions: new Map(data.junctions || []),
    };
  } catch {
    return fresh();
  }
}

// Tableaux positionnels plutôt qu'objets nommés : à 20 000 tronçons, répéter
// les clés "coords"/"length"/"at" coûterait plusieurs centaines de Ko pour
// rien.
export async function save(d: Discovered): Promise<void> {
  prune(d);
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      edges: [...d.edges.entries()].map(([id, e]) => [id, e.coords, Math.round(e.length), e.at]),
      junctions: [...d.junctions.entries()],
      savedAt: new Date().toISOString(),
    })
  );
}

// Au-delà du plafond, abandonne les tronçons enregistrés le plus anciennement.
// Ne touche jamais à `progress` : le tronçon reste acquis, il redeviendra
// simplement dessinable au prochain chargement de sa zone.
function prune(d: Discovered) {
  if (d.edges.size <= MAX_EDGES) return;
  const parAge = [...d.edges.entries()].sort((a, b) => b[1].at - a[1].at);
  d.edges = new Map(parAge.slice(0, MAX_EDGES));
}

// Écriture différée : la découverte d'un tronçon arrive en pleine boucle GPS,
// parfois plusieurs par seconde. Réécrire tout le magasin à chaque fois
// bloquerait le thread JS pendant la marche, exactement quand la carte doit
// rester fluide.
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Discovered | null = null;

export function scheduleSave(d: Discovered, delayMs = 5000) {
  pending = d;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const toSave = pending;
    pending = null;
    if (toSave) save(toSave).catch(() => {});
  }, delayMs);
}

// À appeler quand on ne peut pas se permettre d'attendre le prochain cycle
// (fin de session, import d'une marche) : écrit tout de suite ce qui attend.
export async function flush(d: Discovered): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pending = null;
  await save(d);
}
