import * as Location from 'expo-location';
import type { LocationFix } from '../../../shared/types/index.js';

let watchId: Location.LocationSubscription | null = null;

export interface LocationCallback {
  (fix: LocationFix): void;
}

export async function requestPermissions(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.error('Location permission denied');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Permission request error:', error);
    return false;
  }
}

export async function startLocationTracking(callback: LocationCallback): Promise<void> {
  try {
    if (!watchId) {
      watchId = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (location) => {
          callback({
            lat: location.coords.latitude,
            lon: location.coords.longitude,
            accuracy: location.coords.accuracy ?? undefined,
            speedKmh: (location.coords.speed || 0) * 3.6,
            timestamp: location.timestamp,
          });
        }
      );
    }
  } catch (error) {
    console.error('Failed to start location tracking:', error);
  }
}

export async function stopLocationTracking(): Promise<void> {
  if (watchId) {
    watchId.remove();
    watchId = null;
  }
}

export function isTracking(): boolean {
  return watchId != null;
}

// Simulation pour développement/test sans GPS réel
export async function simulateFix(
  callback: LocationCallback,
  lat: number,
  lon: number,
  accuracy: number = 10,
  speedKmh: number = 1
): Promise<void> {
  callback({
    lat,
    lon,
    accuracy,
    speedKmh,
    timestamp: Date.now(),
  });
}
