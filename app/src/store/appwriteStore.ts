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
        if (isNotFoundError(e)) return null;
        // ECHTER Fehler (Netzwerk, Berechtigung, ...) - NICHT als "existiert nicht" werten.
        // Vorher gab get() hier fälschlich `null` zurück, ununterscheidbar von einem
        // tatsächlich fehlenden Eintrag (siehe Engineering-Review 07.09.2026, Punkt 2).
        log(`get(${key}) fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
        throw e;
      }
      const meta = JSON.parse(row.value as string) as BelegMetaShape;
      try {
        // Cache-Buster als eigener Query-Parameter: { cache: 'no-store' } beeinflusst nur den
        // lokalen Browser-Cache - reicht NICHT aus, wenn Appwrite selbst hinter einem
        // CDN/Edge-Cache liegt, der Antworten unabhaengig vom Client-Cache-Control fuer die
        // URL zwischenspeichert (real aufgetreten 04.09.2026: Nutzer hatte den eigenen
        // Browser-Cache bereits geleert, bekam aber trotzdem noch die alte Datei-Version -
        // das kann nur an einer Zwischenschicht liegen, die die URL selbst als Cache-Schluessel
        // nutzt). Ein bei jedem Aufruf neuer Query-Parameter macht die URL fuer JEDE
        // Caching-Ebene eindeutig und erzwingt so zuverlaessig eine frische Antwort.
        const url = `${storage.getFileDownload({ bucketId: config.bucketId, fileId: rowId })}&_cb=${Date.now()}`;
        // KRITISCH: getFileDownload() liefert nur eine URL zurück, der eigentliche fetch()
        // hier ist ein ROHER Browser-Fetch, der NICHT durch das Appwrite-SDK läuft (das SDK
        // selbst würde bei seinen eigenen Aufrufen automatisch die Session mitschicken). Ohne
        // `credentials: 'include'` sendet der Browser das Appwrite-Session-Cookie NICHT mit,
        // weil die App-Domain (GitHub Pages) und die Appwrite-Domain unterschiedliche Origins
        // sind (Standard-Verhalten von fetch() ist `credentials: 'same-origin'`). Vor der
        // Appwrite-Absicherung (05.09.2026, Bucket auf "Any"-Rolle) fiel das nicht auf, weil
        // unautorisierte Downloads trotzdem funktionierten - seitdem schlug JEDER Beleg-
        // Download in der echten App lautlos fehl (siehe get()-Fehlerbehandlung oben), auch
        // frisch hochgeladene Belege waren betroffen (07.09.2026 real aufgetreten).
        const resp = await fetch(url, { cache: 'no-store', credentials: 'include' });
        // KRITISCH: fetch() schlägt NUR bei echten Netzwerkfehlern fehl, nicht bei HTTP-
        // Fehlercodes (401/404/...) - resp.ok MUSS geprüft werden, bevor der Body als Datei-
        // Inhalt interpretiert wird. Ohne diese Prüfung wurde eine Appwrite-Fehler-JSON-Antwort
        // (bei einem vorübergehenden Berechtigungs-/Netzwerk-Hiccup beim Download) selbst als
        // vermeintlicher PDF-Inhalt in dataUrl geladen - real aufgetreten 07.09.2026: die
        // "Beleg-Feld-Zuordnung"-Funktion lud diesen fälschlich geladenen "Beleg" anschließend
        // erneut hoch und hat damit die ECHTE PDF-Datei dauerhaft mit einer Fehlermeldung
        // überschrieben (nicht mehr wiederherstellbar, Nutzer musste den Beleg neu hochladen).
        if (!resp.ok) throw new Error(`Datei-Download fehlgeschlagen: HTTP ${resp.status}`);
        const blob = await resp.blob();
        meta.dataUrl = await blobToDataURL(blob);
      } catch (e) {
        // Bewusst KEIN throw hier: die Metadaten-Zeile selbst wurde erfolgreich gelesen, nur
        // der Datei-Download (separate Anfrage, z.B. CDN-Hiccup) ist fehlgeschlagen. Aufrufer
        // (z.B. DetailSheet::handleOpenReceipt) prüfen bereits explizit auf `dataUrl == null`
        // und zeigen dann eine eigene Meldung - ein Totalausfall des gesamten get() wäre hier
        // unverhältnismäßig, da die Metadaten (Name, Datum) ja trotzdem nutzbar sind.
        log(`get(${key}) – Beleg-Datei-Download fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
        meta.dataUrl = null;
      }
      return { key, value: JSON.stringify(meta) };
    }

    try {
      const row: Models.DefaultRow = await tablesDB.getRow({ databaseId: config.databaseId, tableId: config.tableId, rowId });
      return { key, value: row.value as string };
    } catch (e) {
      if (isNotFoundError(e)) return null;
      log(`get(${key}) fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
      throw e;
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
        // Zusätzliche Absicherung (Engineering-Nachtrag 07.09.2026, zum Fund oben): Belege
        // sind IMMER PDFs (direkter Upload oder Foto->PDF-Konvertierung, siehe pdf.ts) - ein
        // Blob mit einem klar falschen Typ (z.B. "application/json", wie es bei der oben
        // beschriebenen Datei-Korruption der Fall war) wird NICHT hochgeladen, sondern wirft
        // hier, statt eine echte Datei stillschweigend mit Datenmüll zu überschreiben.
        if (blob.type && blob.type !== 'application/pdf' && blob.size > 0) {
          throw new Error(`Beleg-Inhalt hat unerwarteten Typ "${blob.type}" statt "application/pdf" - Upload abgebrochen, um die bestehende Datei nicht zu überschreiben.`);
        }
        const file = new File([blob], `${obj.name ?? 'beleg'}.pdf`, { type: 'application/pdf' });
        try {
          await storage.deleteFile({ bucketId: config.bucketId, fileId: rowId });
        } catch (e) {
          if (!isNotFoundError(e)) {
            // Best-effort: ein fehlgeschlagenes Löschen VOR dem Hochladen ist bewusst kein
            // Abbruchgrund (die alte Datei bleibt dann einfach liegen, kann später als
            // Karteileiche aufgeräumt werden - siehe CLAUDE_CHECKLIST.md) - anders als ein
            // fehlgeschlagenes createFile weiter unten, DAS ist ein echter Datenverlust.
            log(`⚠ Beleg-Upload: Lösch-Versuch vor dem Hochladen fehlgeschlagen (${key}) - ${e instanceof Error ? e.message : e}`);
          }
        }
        try {
          await storage.createFile({ bucketId: config.bucketId, fileId: rowId, file });
        } catch (e) {
          // ECHTER Fehler: die Datei selbst ist NICHT hochgeladen worden. Vorher wurde das
          // nur geloggt, die Metadaten-Zeile aber TROTZDEM geschrieben - der Aufrufer glaubte
          // dadurch, der Beleg sei gesichert, obwohl die eigentliche Datei fehlt (siehe
          // Engineering-Review 07.09.2026, Punkt 2). Jetzt: werfen, BEVOR die Metadaten-Zeile
          // geschrieben wird.
          log(`⚠ Beleg-Upload fehlgeschlagen (${key}): ${e instanceof Error ? e.message : e}`);
          throw e;
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
    } catch (e) {
      if (!isNotFoundError(e)) {
        // ECHTER Fehler beim Update (z.B. Netzwerk, Berechtigung) - NICHT blind auf createRow
        // ausweichen (das würde bei einer bereits existierenden Zeile ohnehin nur erneut
        // fehlschlagen und den ursprünglichen Fehler verschleiern). Nur "Zeile existiert noch
        // nicht" (404) rechtfertigt den Fallback auf createRow.
        log(`⚠ set(${key}) fehlgeschlagen (update): ${e instanceof Error ? e.message : e}`);
        throw e;
      }
      try {
        await tablesDB.createRow({
          databaseId: config.databaseId,
          tableId: config.tableId,
          rowId,
          data: { value: finalValue },
        });
      } catch (e2) {
        log(`⚠ set(${key}) fehlgeschlagen (weder update noch create möglich): ${e2 instanceof Error ? e2.message : e2}`);
        throw e2;
      }
    }
    return { key, value: finalValue };
  }

  async function del(key: string): Promise<{ key: string; deleted: true }> {
    const rowId = toAppwriteId(key);
    if (key.startsWith('receipt:')) {
      try {
        await storage.deleteFile({ bucketId: config.bucketId, fileId: rowId });
      } catch (e) {
        if (!isNotFoundError(e)) {
          // Best-effort wie beim Upload: eine liegen gebliebene Datei ohne Referenz ist eine
          // bekannte, akzeptierte Karteileiche (siehe CLAUDE_CHECKLIST.md) - kein Grund, das
          // Löschen der eigentlichen Datensatz-Zeile unten zu verhindern.
          log(`⚠ Beleg-Löschen fehlgeschlagen (${key}): ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    try {
      await tablesDB.deleteRow({ databaseId: config.databaseId, tableId: config.tableId, rowId });
    } catch (e) {
      if (isNotFoundError(e)) return { key, deleted: true }; // war schon weg - kein Fehler
      log(`delete(${key}) fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
    return { key, deleted: true };
  }

  return { get, set, delete: del };
}
