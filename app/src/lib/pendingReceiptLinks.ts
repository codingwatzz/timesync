// Schützt vor dem Bug vom 01.09.2026: Beim Fotografieren eines Belegs (Button "Foto
// aufnehmen", Input mit capture="environment") übergibt der Browser an die native
// Kamera-App des Handys. Kehrt die Seite danach zurück, kann der Tab in der Zwischenzeit vom
// Betriebssystem pausiert oder sogar neu geladen worden sein. handlePhotoUpload/
// handlePdfUpload machen dabei ZWEI unabhängige, nacheinander abgewartete Appwrite-
// Schreibvorgänge: 1) den Beleg selbst hochladen, 2) den Tageseintrag mit der neuen
// receiptId aktualisieren. Wird die Seite genau zwischen 1) und 2) unterbrochen, landet der
// Beleg zwar sicher in Appwrite, aber der Tageseintrag verweist nie darauf - eine für den
// Nutzer unsichtbare Karteileiche (so am 01.09.2026 real aufgetreten und über einen direkten
// Appwrite-Storage-Check gefunden, nicht nur vermutet).
//
// Lösung: Vor den beiden Schreibvorgängen wird die Absicht synchron (kein await nötig) in
// localStorage vermerkt. Nach erfolgreichem Abschluss BEIDER Schritte wird der Vermerk
// gelöscht. Bleibt er stehen (weil Schritt 2 nie lief), holt repairPendingReceiptLinks beim
// nächsten App-Start die fehlende Verknüpfung nach - rein additiv, verändert am Tageseintrag
// nur die receiptIds-Liste.

import type { KVStore } from '../store/types';
import { loadEntry, saveEntry, loadReceipt } from '../hooks/entryStorage';

const PREFIX = 'pendingReceiptLink:';

function storageKey(dateKey: string, rid: string): string {
  return `${PREFIX}${dateKey}:${rid}`;
}

export function markPendingReceiptLink(dateKey: string, rid: string): void {
  try {
    localStorage.setItem(storageKey(dateKey, rid), JSON.stringify({ dateKey, rid, markedAt: Date.now() }));
  } catch {
    // localStorage kann in seltenen Fällen nicht verfügbar sein (z.B. privater Modus mit
    // vollem Kontingent) - dann entfällt dieser Schutz einfach, kein harter Fehler für den
    // eigentlichen Upload.
  }
}

export function clearPendingReceiptLink(dateKey: string, rid: string): void {
  try {
    localStorage.removeItem(storageKey(dateKey, rid));
  } catch {
    // s.o.
  }
}

interface PendingLink {
  dateKey: string;
  rid: string;
}

function readAllPending(): PendingLink[] {
  const result: PendingLink[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as PendingLink;
        if (parsed.dateKey && parsed.rid) result.push(parsed);
      } catch {
        // korrupter Eintrag - ignorieren, betrifft nur diesen einen Vermerk
      }
    }
  } catch {
    return [];
  }
  return result;
}

/**
 * Beim App-Start aufgerufen: holt liegen gebliebene Beleg-Verknüpfungen nach, falls der
 * Tageseintrag die receiptId tatsächlich noch nicht enthält.
 */
export async function repairPendingReceiptLinks(
  store: KVStore,
  log: (msg: string) => void,
): Promise<void> {
  const pending = readAllPending();
  for (const { dateKey, rid } of pending) {
    try {
      const [entry, receipt] = await Promise.all([loadEntry(store, dateKey), loadReceipt(store, rid)]);

      if (!receipt) {
        // Beleg selbst nicht (mehr) vorhanden - Vermerk kann nicht sinnvoll nachgeholt werden.
        clearPendingReceiptLink(dateKey, rid);
        continue;
      }
      if (!entry) {
        // Tageseintrag existiert (noch) nicht - Vermerk stehen lassen, nächster Start versucht
        // es erneut.
        continue;
      }
      if (entry.receiptIds.includes(rid)) {
        // Verknüpfung ist doch vorhanden (zweiter Schreibversuch war zwischenzeitlich
        // erfolgreich) - nur den Vermerk aufräumen.
        clearPendingReceiptLink(dateKey, rid);
        continue;
      }

      const nextEntry = { ...entry, receiptIds: [...entry.receiptIds, rid] };
      await saveEntry(store, dateKey, nextEntry);
      clearPendingReceiptLink(dateKey, rid);
      log(`Beleg-Verknüpfung nachgeholt: ${rid} → ${dateKey} (war nach Unterbrechung offen geblieben)`);
    } catch (e) {
      log(`Beleg-Verknüpfung nachholen fehlgeschlagen (${dateKey}/${rid}): ${e instanceof Error ? e.message : e}`);
      // Vermerk bewusst NICHT löschen - nächster App-Start versucht es erneut.
    }
  }
}
