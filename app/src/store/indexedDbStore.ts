// Rein lokaler Fallback-Speicher (nur auf diesem Gerät, kein Geräte-Sync). Wird nur
// verwendet, wenn Appwrite nicht erreichbar ist - damit die App trotzdem nutzbar bleibt.

import type { KVEntry, KVStore } from './types';

export function createIndexedDbStore(): KVStore {
  const dbReady = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('zeiterfassung-db', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  async function get(key: string): Promise<KVEntry | null> {
    const db = await dbReady;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? { key, value: req.result as string } : null);
      req.onerror = () => reject(req.error);
    });
  }

  async function set(key: string, value: string): Promise<KVEntry> {
    const db = await dbReady;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve({ key, value });
      tx.onerror = () => reject(tx.error);
    });
  }

  async function del(key: string): Promise<{ key: string; deleted: true }> {
    const db = await dbReady;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = () => resolve({ key, deleted: true });
      tx.onerror = () => reject(tx.error);
    });
  }

  return { get, set, delete: del };
}
