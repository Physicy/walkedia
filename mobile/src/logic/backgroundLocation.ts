// Détection de marche en arrière-plan (règle "app fermée", voir le plan) :
// tâche native qui continue de tourner même app fermée/tuée (nécessite la
// permission de localisation "Toujours"), écrit les fixes dans un tampon
// AsyncStorage séparé — la tâche tourne dans un contexte JS isolé, sans
// accès à l'état React de l'app — lu et rejoué au prochain lancement (voir
// useWalkedia.ts, consumeBackgroundBuffer).
//
// `defineTask` DOIT être appelé au niveau module (pas dans un composant/
// hook) : c'est ce qui permet à l'OS de relancer ce fichier même quand
// aucun écran React n'est monté. Jamais activé par défaut — uniquement à
// l'activation explicite d'un réglage opt-in (voir ProfileScreen.tsx),
// après quoi seulement la permission "Toujours" est demandée.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { MAX_ACCURACY } from './matching';
import { haversine } from './geo';

export const BACKGROUND_LOCATION_TASK = 'walkedia-background-location';

const STORAGE_KEY = 'walkedia-bg-shadow-v1';
const MAX_AGE_MS = 3600000; // 1h : au-delà, un fix est trop vieux pour rester pertinent
const MAX_POINTS = 4000;
export const MIN_IMPORT_DISTANCE = 80; // m : en dessous, pas assez significatif pour proposer l'import

export interface BgFix {
  lat: number;
  lon: number;
  accuracy: number | null;
  t: number;
}

interface BgBuffer {
  fixes: BgFix[];
  startedAt: number | null;
}

async function readBuffer(): Promise<BgBuffer> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { fixes: [], startedAt: null };
    const data = JSON.parse(raw);
    return { fixes: Array.isArray(data.fixes) ? data.fixes : [], startedAt: data.startedAt ?? null };
  } catch {
    // Lecture cassée ou tampon pas encore initialisé (premier réveil en
    // mode "tué", voir commentaire en tête de fichier) : on repart d'un
    // tampon vide plutôt que de faire planter la tâche.
    return { fixes: [], startedAt: null };
  }
}

async function writeBuffer(buffer: BgBuffer): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;

  const buffer = await readBuffer();
  for (const loc of data.locations) {
    if (loc.coords.accuracy != null && loc.coords.accuracy > MAX_ACCURACY) continue;
    buffer.fixes.push({ lat: loc.coords.latitude, lon: loc.coords.longitude, accuracy: loc.coords.accuracy, t: loc.timestamp });
  }
  if (!buffer.fixes.length) return;

  const cutoff = Date.now() - MAX_AGE_MS;
  while (buffer.fixes.length && buffer.fixes[0].t < cutoff) buffer.fixes.shift();
  while (buffer.fixes.length > MAX_POINTS) buffer.fixes.shift();
  buffer.startedAt = buffer.fixes.length ? buffer.fixes[0].t : null;

  await writeBuffer(buffer);
});

// -------------------------------------------------------- activation/permission

export async function isBackgroundTrackingActive(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
}

// Ne demande la permission "Toujours" qu'à l'activation explicite du
// réglage (opt-in, voir ProfileScreen.tsx) — jamais groupée avec la
// permission au premier plan, jamais au lancement de l'app : c'est ce
// qu'attendent Apple/Google pour ce niveau de permission.
export async function startBackgroundTracking(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { ok: false, reason: "Active d'abord la localisation au premier plan." };
  }

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    return { ok: false, reason: 'Permission de localisation "Toujours" refusée.' };
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 15,
    deferredUpdatesInterval: 30000,
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.Fitness,
    foregroundService: {
      notificationTitle: 'Walkedia',
      notificationBody: 'Détection de marche active en arrière-plan',
    },
  });
  return { ok: true };
}

export async function stopBackgroundTracking(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

// -------------------------------------------------------- lecture au démarrage

// Lit et vide le tampon d'un coup (jamais reproposée deux fois la même
// marche) — appelé au lancement de l'app (voir useWalkedia.ts). Retourne
// `null` si rien d'assez significatif n'a été détecté.
export async function consumeBackgroundBuffer(): Promise<{ fixes: BgFix[]; startedAt: number; distance: number } | null> {
  const buffer = await readBuffer();
  await AsyncStorage.removeItem(STORAGE_KEY);
  if (buffer.fixes.length < 2 || buffer.startedAt == null) return null;

  let distance = 0;
  for (let i = 1; i < buffer.fixes.length; i++) {
    distance += haversine([buffer.fixes[i - 1].lat, buffer.fixes[i - 1].lon], [buffer.fixes[i].lat, buffer.fixes[i].lon]);
  }
  if (distance < MIN_IMPORT_DISTANCE) return null;

  return { fixes: buffer.fixes, startedAt: buffer.startedAt, distance };
}
