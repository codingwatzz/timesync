// Appwrite-basierter KVStore: Einträge landen als Zeilen in einer Tabelle, Belege (Dateien)
// im Appwrite-Storage-Bucket (Firestore/TablesDB hat ein 1MB-Zeilenlimit, PDFs können größer
// sein - siehe Mapping-Referenz-Dokument im Projekt für den Hintergrund dieser Entscheidung).

import { Client, TablesDB, Storage, type Models } from 'appwrite';
import type { KVEntry, KVStore, StoreLogger } from './types';
import { toAppwriteId, isNotFoundError } from './appwriteId';

export interface AppwriteConfig {
  endpoint: string;
  projectId: string;
  databaseId: string;
  tableId: string;
  bucketId: string;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface BelegMetaShape {
  id: string;
  name?: string;
  dataUrl?: string | null;
  [key: string]: unknown;
}

/**
 * Baut den Appwrite-KVStore auf. Wirft, wenn der Verbindungstest fehlschlägt (z.B. falsche
 * Projekt-ID oder fehlende Berechtigungen) - der Aufrufer kann dann auf IndexedDB zurückfallen.
 */
/**
 * Verhindert Browser-HTTP-Caching für Appwrite-API-Aufrufe. Verdacht (31.08.2026): Ein
 * frisches Neuladen der Seite zeigte veraltete Werte (exakt den Stand VOR dem letzten
 * Speichern) zurück, obwohl das Speichern selbst nachweislich erfolgreich war - ein klassisches
 * Symptom für eine im Browser gecachte GET-Antwort, die nach einem Reload erneut ausgeliefert
 * wird, statt den aktuellen Appwrite-Stand neu abzufragen. Das Appwrite-SDK selbst setzt keine
 * cache-verhindernden Header, daher hier per globalem fetch-Patch nachgerüstet.
 */
let httpCachingDisabled = false;
function disableHttpCachingForAppwrite(endpoint: string): void {
  if (httpCachingDisabled) return;
  if (typeof window === 'undefined') return; // z.B. in Node-Testumgebung ohne DOM
  httpCachingDisabled = true;
  const endpointHost = new URL(endpoint).host;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes(endpointHost)) {
      return originalFetch(input, { ...init, cache: 'no-store' });
    }
    return originalFetch(input, init);
  };
}

export async function createAppwriteStore(
  config: AppwriteConfig,
  log: StoreLogger,
): Promise<KVStore> {
  disableHttpCachingForAppwrite(config.endpoint);
  const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId);
  const tablesDB = new TablesDB(client);
  const storage = new Storage(client);

  // Verbindungstest: eine harmlose Leseanfrage, um Endpoint/Projekt/Tabelle/Berechtigungen
  // sofort zu prüfen, statt erst beim ersten echten Speichervorgang zu scheitern.
  try {
    await tablesDB.getRow({
      databaseId: config.databaseId,
      tableId: config.tableId,
      rowId: 'connection_test',
    });
    log('Verbindungstest OK (Zeile nicht gefunden ist normal, Zugriff funktioniert).');
  } catch (testErr) {
    if (isNotFoundError(testErr)) {
      log('Verbindungstest OK: Datenbank/Tabelle erreichbar (404 = Testzeile existiert nicht, das ist normal).');
    } else {
      const msg = testErr instanceof Error ? testErr.message : String(testErr);
      log(`⚠ Verbindungstest FEHLGESCHLAGEN: ${msg}`);
      throw testErr;
    }
  }

  async function get(key: string): Promise<KVEntry | null> {
    const rowId = toAppwriteId(key);

    if (key.startsWith('receipt:')) {
      let row: Models.DefaultRow;
      try {
        row = await tablesDB.getRow({ databaseId: config.databaseId, tableId: config.tableId, rowId });
      } catch (e) {
        if (!isNotFoundError(e)) log(`get(${key}) fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
        return null;
      }
      const meta = JSON.parse(row.value as string) as BelegMetaShape;
      try {
        const url = storage.getFileDownload({ bucketId: config.bucketId, fileId: rowId });
        const resp = await fetch(url);
        const blob = await resp.blob();
        meta.dataUrl = await blobToDataURL(blob);
      } catch (e) {
        log(`get(${key}) – Beleg-Datei-Download fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
        meta.dataUrl = null;
      }
      return { key, value: JSON.stringify(meta) };
    }

    try {
      const row: Models.DefaultRow = await tablesDB.getRow({ databaseId: config.databaseId, tableId: config.tableId, rowId });
      return { key, value: row.value as string };
    } catch (e) {
      if (!isNotFoundError(e)) log(`get(${key}) fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  async function set(key: string, value: string): Promise<KVEntry> {
    const rowId = toAppwriteId(key);
    let finalValue = value;

    if (key.startsWith('receipt:')) {
      const obj = JSON.parse(value) as BelegMetaShape;
      const dataUrl = obj.dataUrl;
      const meta = { ...obj };
      delete meta.dataUrl;
      if (dataUrl) {
        const resp = await fetch(dataUrl);
        const blob = await resp.blob();
        const file = new File([blob], `${obj.name ?? 'beleg'}.pdf`, { type: 'application/pdf' });
        try {
          await storage.deleteFile({ bucketId: config.bucketId, fileId: rowId });
        } catch {
          /* Datei existierte noch nicht - kein Problem */
        }
        try {
          await storage.createFile({ bucketId: config.bucketId, fileId: rowId, file });
        } catch (e) {
          log(`⚠ Beleg-Upload fehlgeschlagen (${key}): ${e instanceof Error ? e.message : e}`);
        }
      }
      finalValue = JSON.stringify(meta);
    }

    try {
      await tablesDB.updateRow({
        databaseId: config.databaseId,
        tableId: config.tableId,
        rowId,
        data: { value: finalValue },
      });
    } catch {
      try {
        await tablesDB.createRow({
          databaseId: config.databaseId,
          tableId: config.tableId,
          rowId,
          data: { value: finalValue },
        });
      } catch (e2) {
        log(`⚠ set(${key}) fehlgeschlagen – weder update noch create möglich: ${e2 instanceof Error ? e2.message : e2}`);
      }
    }
    return { key, value: finalValue };
  }

  async function del(key: string): Promise<{ key: string; deleted: true }> {
    const rowId = toAppwriteId(key);
    if (key.startsWith('receipt:')) {
      try {
        await storage.deleteFile({ bucketId: config.bucketId, fileId: rowId });
      } catch {
        /* Datei existierte nicht - kein Problem */
      }
    }
    try {
      await tablesDB.deleteRow({ databaseId: config.databaseId, tableId: config.tableId, rowId });
    } catch (e) {
      log(`delete(${key}) fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    }
    return { key, deleted: true };
  }

  return { get, set, delete: del };
}
