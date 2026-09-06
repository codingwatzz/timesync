// Einheitliches Key-Value-Storage-Interface. Jedes Backend (Appwrite, IndexedDB, ...)
// implementiert genau dieses Interface -> der Rest der App kennt nur "KVStore",
// nicht die konkrete Speicher-Technologie dahinter.

export interface KVEntry {
  key: string;
  value: string;
}

export interface KVStore {
  /** Liefert `null` NUR wenn der Schlüssel wirklich nicht existiert. Bei einem echten
   * Fehler (Netzwerk, Berechtigung, ...) wird geworfen/rejected, NICHT `null` zurückgegeben -
   * Aufrufer dürfen "kein Eintrag" und "Lesen fehlgeschlagen" nicht verwechseln (siehe
   * Engineering-Review 07.09.2026, Punkt 2). */
  get(key: string): Promise<KVEntry | null>;
  /** Wirft/rejected bei einem echten Schreibfehler - löst NICHT still auf, als wäre
   * gespeichert worden, obwohl es das nicht wurde. */
  set(key: string, value: string): Promise<KVEntry>;
  /** Wirft/rejected bei einem echten Löschfehler. Ein bereits nicht (mehr) vorhandener
   * Schlüssel gilt als Erfolg (idempotent), kein Fehler. */
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
