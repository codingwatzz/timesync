import type { TagesEintrag, BelegMeta } from '../core/types';

export { dateKey } from '../core/holidays';

export interface ImportCandidate {
  key: string; // YYYY-MM-DD
  data: TagesEintrag;
}

/** Beleg-Metadaten aus einem Rohdaten-Backup, key = receipt-ID (ohne Praefix). */
export type ImportReceipts = Record<string, Omit<BelegMeta, 'id'>>;

export interface ParseResult {
  candidates: ImportCandidate[];
  /** Nur gesetzt, wenn die Datei ein vollstaendiges Rohdaten-Backup war (Format
   * "zeiterfassung-backup-v1", siehe backupExport.ts) - enthaelt die echten Beleg-Dateien
   * (Base64), die beim Bestaetigen mit wiederhergestellt werden sollen. */
  receipts?: ImportReceipts;
  error?: string;
}

/**
 * Liest + VALIDIERT eine Import-/Backup-JSON-Datei, schreibt aber noch NICHTS in den Store
 * (siehe UX-Review 06.09.2026, Punkt 4.1). Das eigentliche Schreiben übernimmt erst
 * lib/importPlan.ts::applyImportPlan(), NACHDEM der Nutzer eine Übersicht bestätigt hat -
 * siehe components/ImportConfirmDialog.tsx.
 *
 * Versteht ZWEI Formate:
 * 1. Das vollständige Rohdaten-Backup (`format: "zeiterfassung-backup-v1"`, aus dem
 *    Monats-Export) - Einträge liegen hier bereits 1:1 als TagesEintrag vor (kein
 *    Nachbau/Defaults nötig), inklusive echter Belege (siehe `receipts` oben).
 * 2. Die ältere, einfachere "entries"-Array-Form ohne Belege (reine Feld-Werte, jedes
 *    Element mit einem "date"-Feld) - Belege werden hier bewusst NICHT übernommen (das
 *    Format kennt keine echten Beleg-Dateien, nur die jetzt möglicherweise falschen
 *    receiptIds aus einer alten Export-Datei wären ohne die Dateien dahinter wertlos).
 */
export async function parseImportFile(file: File): Promise<ParseResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { candidates: [], error: 'Datei konnte nicht gelesen werden.' };
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      candidates: [],
      error: 'Keine gültige JSON-Datei. Bitte nur unveränderte Export-/Backup-Dateien dieser App verwenden.',
    };
  }

  if ((data as { format?: string })?.format === 'zeiterfassung-backup-v1') {
    return parseBackupFormat(data as Record<string, unknown>);
  }

  const list = Array.isArray(data) ? data : (data as { entries?: unknown[] })?.entries;
  if (!Array.isArray(list)) {
    return {
      candidates: [],
      error:
        'Ungültiges Format: kein "entries"-Array gefunden. Erwartet wird eine von dieser App ' +
        'erzeugte Datei - z.B. "..._Rohdaten-Backup.json" aus dem Monats-Export, oder eine ' +
        'ältere reine Einträge-JSON mit einem "entries"-Array.',
    };
  }

  const candidates: ImportCandidate[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    const key = raw.date as string | undefined;
    if (!key) continue;
    candidates.push({
      key,
      data: {
        typ: (raw.typ as TagesEintrag['typ']) || 'A',
        typManuell: true,
        ho: Boolean(raw.ho),
        start: (raw.start as string) || '', ende: (raw.ende as string) || '', pause: String(raw.pause ?? ''),
        start2: (raw.start2 as string) || '', ende2: (raw.ende2 as string) || '', pause2: String(raw.pause2 ?? ''),
        beschreibung: (raw.beschreibung as string) || '',
        km: String(raw.km ?? ''), transport: String(raw.transport ?? ''), hotel: String(raw.hotel ?? ''),
        bewirtung: String(raw.bewirtung ?? ''), sonstiges: String(raw.sonstiges ?? ''),
        reiseland: (raw.reiseland as TagesEintrag['reiseland']) || 'Deutschland',
        reiseart: (raw.reiseart as TagesEintrag['reiseart']) || '',
        fr: Boolean(raw.fr), mi: Boolean(raw.mi), ab: Boolean(raw.ab),
        receiptIds: [],
      },
    });
  }

  if (candidates.length === 0) {
    return {
      candidates: [],
      error: 'Die Datei enthält keine gültigen Tageseinträge (jeweils ein "date"-Feld nötig).',
    };
  }
  return { candidates };
}

function parseBackupFormat(data: Record<string, unknown>): ParseResult {
  const entriesObj = data.entries as Record<string, TagesEintrag> | undefined;
  if (!entriesObj || typeof entriesObj !== 'object') {
    return { candidates: [], error: 'Ungültiges Rohdaten-Backup: kein "entries"-Objekt gefunden.' };
  }
  const candidates: ImportCandidate[] = Object.entries(entriesObj).map(([key, entry]) => ({ key, data: entry }));
  if (candidates.length === 0) {
    return { candidates: [], error: 'Das Rohdaten-Backup enthält keine Tageseinträge.' };
  }
  const receipts = (data.receipts as ImportReceipts | undefined) ?? {};
  return { candidates, receipts };
}
