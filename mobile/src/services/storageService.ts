import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import type { Session, StorageData } from '../../../shared/types/index.js';

const STORAGE_KEY = 'walkedia-v1';
const DB_NAME = 'walkedia.db';

let db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        startedAt INTEGER,
        endedAt INTEGER,
        edges TEXT,
        junctions TEXT,
        imported INTEGER,
        distance REAL
      );
      CREATE TABLE IF NOT EXISTS shadow_fixes (
        id INTEGER PRIMARY KEY,
        lat REAL,
        lon REAL,
        accuracy REAL,
        timestamp INTEGER
      );
    `);
  }
  return db;
}

export async function loadProgress(): Promise<StorageData> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { edges: new Set(), junctions: new Set(), sessions: [] };
    }
    const parsed = JSON.parse(raw);
    return {
      edges: new Set(parsed.edges || []),
      junctions: new Set(parsed.junctions || []),
      sessions: parsed.sessions || [],
    };
  } catch (error) {
    console.error('Failed to load progress:', error);
    return { edges: new Set(), junctions: new Set(), sessions: [] };
  }
}

export async function saveProgress(data: StorageData): Promise<void> {
  try {
    const toSave = {
      edges: Array.from(data.edges),
      junctions: Array.from(data.junctions),
      sessions: data.sessions,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error('Failed to save progress:', error);
  }
}

export async function saveSession(session: Session): Promise<void> {
  try {
    const database = await getDB();
    await database.runAsync(
      'INSERT INTO sessions (id, startedAt, endedAt, edges, junctions, imported, distance) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        session.id,
        session.startedAt,
        session.endedAt || null,
        JSON.stringify(Array.from(session.edges)),
        JSON.stringify(Array.from(session.junctions)),
        session.imported ? 1 : 0,
        session.distance,
      ]
    );
  } catch (error) {
    console.error('Failed to save session to DB:', error);
  }
}

export async function getSessions(): Promise<Session[]> {
  try {
    const database = await getDB();
    const rows = await database.getAllAsync<any>('SELECT * FROM sessions ORDER BY startedAt DESC');
    return rows.map((row) => ({
      id: row.id,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      edges: JSON.parse(row.edges),
      junctions: JSON.parse(row.junctions),
      imported: row.imported === 1,
      distance: row.distance,
    }));
  } catch (error) {
    console.error('Failed to get sessions:', error);
    return [];
  }
}

export async function saveShadowFix(lat: number, lon: number, accuracy?: number, timestamp?: number): Promise<void> {
  try {
    const database = await getDB();
    await database.runAsync(
      'INSERT INTO shadow_fixes (lat, lon, accuracy, timestamp) VALUES (?, ?, ?, ?)',
      [lat, lon, accuracy || null, timestamp || Date.now()]
    );

    // Limiter à 1 heure max de données (86400000ms)
    const oneHourAgo = Date.now() - 3600000;
    await database.runAsync('DELETE FROM shadow_fixes WHERE timestamp < ?', [oneHourAgo]);
  } catch (error) {
    console.error('Failed to save shadow fix:', error);
  }
}

export async function getShadowFixes(): Promise<Array<{ lat: number; lon: number; accuracy?: number; timestamp: number }>> {
  try {
    const database = await getDB();
    const rows = await database.getAllAsync<any>(
      'SELECT lat, lon, accuracy, timestamp FROM shadow_fixes ORDER BY timestamp ASC'
    );
    return rows.map((row) => ({
      lat: row.lat,
      lon: row.lon,
      accuracy: row.accuracy,
      timestamp: row.timestamp,
    }));
  } catch (error) {
    console.error('Failed to get shadow fixes:', error);
    return [];
  }
}

export async function clearShadowFixes(): Promise<void> {
  try {
    const database = await getDB();
    await database.runAsync('DELETE FROM shadow_fixes');
  } catch (error) {
    console.error('Failed to clear shadow fixes:', error);
  }
}
