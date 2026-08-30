// Einheitliches Key-Value-Storage-Interface. Jedes Backend (Appwrite, IndexedDB, ...)
// implementiert genau dieses Interface -> der Rest der App kennt nur "KVStore",
// nicht die konkrete Speicher-Technologie dahinter.

export interface KVEntry {
  key: string;
  value: string;
}

export interface KVStore {
  get(key: string): Promise<KVEntry | null>;
  set(key: string, value: string): Promise<KVEntry>;
  delete(key: string): Promise<{ key: string; deleted: true }>;
}

/** Bekannte Speicher-Modi, für Diagnose-/Statusanzeige in der UI. */
export type StorageMode =
  | 'ermittelt-noch'
  | 'appwrite'
  | 'indexeddb'
  | 'claude-artefakt';

export interface StoreLogger {
  (message: string): void;
}
