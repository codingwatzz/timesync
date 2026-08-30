// Wählt beim App-Start das passende Storage-Backend: Appwrite (Cloud-Sync) bevorzugt,
// IndexedDB (rein lokal) als Fallback, falls Appwrite nicht erreichbar ist.
//
// Hinweis zur Vereinfachung gegenüber der alten Version: Der frühere dritte Zweig
// "Claude-Artefakt (window.storage)" ist hier bewusst entfernt, weil diese App jetzt
// ausschließlich als eigenständige PWA läuft, nicht mehr im Claude-Chat-Artefakt-Rahmen.

import type { KVStore, StorageMode, StoreLogger } from './types';
import { createAppwriteStore, type AppwriteConfig } from './appwriteStore';
import { createIndexedDbStore } from './indexedDbStore';

export interface StoreResult {
  store: KVStore;
  mode: StorageMode;
}

export async function createStore(
  config: AppwriteConfig,
  log: StoreLogger = () => {},
): Promise<StoreResult> {
  try {
    log(`Verbinde mit ${config.endpoint} (Projekt ${config.projectId})…`);
    const store = await createAppwriteStore(config, log);
    log('Speicher-Modus: Appwrite Cloud-Sync (aktiv)');
    return { store, mode: 'appwrite' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`⚠ Appwrite-Sync nicht verfügbar, nutze lokalen Speicher (kein Geräte-Sync). Grund: ${msg}`);
  }

  log('Speicher-Modus: Lokal (IndexedDB) – KEIN Geräte-Sync!');
  return { store: createIndexedDbStore(), mode: 'indexeddb' };
}
