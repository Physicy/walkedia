import type { Session, StorageData } from '../types/index.js';

const STORAGE_KEY = 'walkedia-v1';

export interface IStorage {
  loadProgress(): Promise<StorageData>;
  saveProgress(data: StorageData): Promise<void>;
  saveSession(session: Session): Promise<void>;
  getSessions(): Promise<Session[]>;
}

export class MemoryStorage implements IStorage {
  private data: StorageData = {
    edges: new Set(),
    junctions: new Set(),
    sessions: [],
  };

  async loadProgress(): Promise<StorageData> {
    return this.data;
  }

  async saveProgress(data: StorageData): Promise<void> {
    this.data = data;
  }

  async saveSession(session: Session): Promise<void> {
    this.data.sessions.push(session);
  }

  async getSessions(): Promise<Session[]> {
    return this.data.sessions;
  }
}

// Pour web (localStorage)
export class LocalStorageImpl implements IStorage {
  async loadProgress(): Promise<StorageData> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { edges: new Set(), junctions: new Set(), sessions: [] };
    }
    try {
      const parsed = JSON.parse(raw);
      return {
        edges: new Set(parsed.edges || []),
        junctions: new Set(parsed.junctions || []),
        sessions: parsed.sessions || [],
      };
    } catch {
      return { edges: new Set(), junctions: new Set(), sessions: [] };
    }
  }

  async saveProgress(data: StorageData): Promise<void> {
    const toSave = {
      edges: Array.from(data.edges),
      junctions: Array.from(data.junctions),
      sessions: data.sessions,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }

  async saveSession(session: Session): Promise<void> {
    const data = await this.loadProgress();
    data.sessions.push(session);
    await this.saveProgress(data);
  }

  async getSessions(): Promise<Session[]> {
    const data = await this.loadProgress();
    return data.sessions;
  }
}

// Fonction helper pour créer le bon storage selon la plateforme
export function createStorage(impl?: IStorage): IStorage {
  return impl || new MemoryStorage();
}
