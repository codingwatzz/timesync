// Rohdaten-Backup als vierte Datei im Monats-Export-.zip - ALLE Tageseinträge des Monats
// (nicht nur kosten-/reiserelevante wie in exportZeilen.ts) plus die referenzierten Belege
// als echte Dateien (Base64), nicht nur Metadaten. Läuft komplett im Browser, keine externe
// Infrastruktur nötig (kein Server, kein Cloud-Speicher, keine Secrets) - der Nutzer lädt die
// Datei einfach zusammen mit den anderen drei mit herunter und sichert sie selbst, genau wie
// er das ohnehin schon monatlich für den Export tut.
//
// Vorgeschichte (04.09.2026, siehe Git-Historie): ein automatisiertes Backup über GitHub
// Actions (erst Google-Drive-Service-Account, dann Email-Versand) wurde vorbereitet, dann
// aber zugunsten dieser deutlich einfacheren Lösung verworfen, weil der Nutzer den
// Monats-Export ohnehin schon zuverlässig manuell durchführt.
//
// WICHTIG: Es gibt aktuell KEINE automatische Wiederherstellung aus dieser Datei - der
// bestehende JSON-Import (lib/exportImport.ts) versteht dieses Format NICHT (er erwartet ein
// einfaches "entries"-Array ohne Belege) und verwirft beim Import ohnehin jegliche
// receiptIds. Diese Backup-Datei ist aktuell ein reines Sicherungs-Archiv zum Nachschauen/
// manuellen Wiederherstellen im Notfall, kein Ein-Klick-Restore.

import type { TagesEintrag } from '../../core/types';
import type { KVStore } from '../../store/types';

export interface BackupJson {
  format: 'zeiterfassung-backup-v1';
  generatedAt: string;
  year: number;
  month: number;
  entries: Record<string, TagesEintrag>;
  receipts: Record<string, { name?: string; dataUrl: string | null }>;
}

interface BelegMetaShape {
  name?: string;
  dataUrl?: string | null;
  [key: string]: unknown;
}

/** Baut das Rohdaten-Backup für einen Monat: alle Einträge (so wie sie sind, unverändert)
 * plus alle referenzierten Belege als echte Datei-Inhalte (Base64-Data-URL). */
export async function buildBackupJson(
  year: number, month: number, entries: Record<string, TagesEintrag>, store: KVStore,
): Promise<Blob> {
  const receiptIds = new Set<string>();
  Object.values(entries).forEach((e) => (e.receiptIds || []).forEach((rid) => receiptIds.add(rid)));

  const receipts: BackupJson['receipts'] = {};
  for (const rid of receiptIds) {
    const row = await store.get(`receipt:${rid}`);
    if (!row) continue; // Beleg-Referenz zeigt ins Leere (z.B. schon gelöscht) - überspringen
    const meta = JSON.parse(row.value) as BelegMetaShape;
    receipts[rid] = { name: meta.name, dataUrl: meta.dataUrl ?? null };
  }

  const backup: BackupJson = {
    format: 'zeiterfassung-backup-v1',
    generatedAt: new Date().toISOString(),
    year,
    month,
    entries,
    receipts,
  };

  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}
