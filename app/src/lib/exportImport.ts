import type { KVStore } from '../store/types';
import type { ExportDatei, ExportZeile, TagesEintrag } from '../core/types';
import { dateKey } from '../core/holidays';
import { daysInMonth } from '../core/formatters';
import { loadReceipt } from '../hooks/entryStorage';

export { dateKey } from '../core/holidays';

export async function buildExportRows(
  store: KVStore,
  year: number,
  month: number,
  entries: Record<string, TagesEintrag>,
): Promise<{ rows: ExportZeile[]; receiptCount: number }> {
  const n = daysInMonth(year, month);
  const rows: ExportZeile[] = [];
  let receiptCount = 0;

  for (let d = 1; d <= n; d++) {
    const key = dateKey(year, month, d);
    const e = entries[key];
    if (e && e.typ === 'A' && !e.ho) {
      const receipts = [];
      for (const rid of e.receiptIds) {
        const r = await loadReceipt(store, rid);
        if (r) { receipts.push(r); receiptCount++; }
      }
      rows.push({ date: key, ...e, receipts });
    }
  }
  return { rows, receiptCount };
}

export function buildExportPayload(year: number, month: number, rows: ExportZeile[]): ExportDatei {
  return {
    format: 'zeiterfassung-export-v1',
    year,
    month,
    generatedAt: new Date().toISOString(),
    entries: rows,
  };
}

export function downloadExportFile(payload: ExportDatei): void {
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  a.download = `${payload.year}-${pad2(payload.month)}_Zeiterfassung-Export.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export interface ImportResult {
  count: number;
  error?: string;
}

/**
 * Liest eine Export-/Import-JSON-Datei und schreibt jeden enthaltenen Eintrag über
 * saveEntry in den Store. Gibt die Anzahl geschriebener Einträge zurück (oder einen Fehler).
 */
export async function importFromFile(
  file: File,
  saveEntry: (key: string, data: TagesEintrag) => Promise<void>,
): Promise<ImportResult> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as unknown;
    const list = Array.isArray(data) ? data : (data as { entries?: unknown[] }).entries;
    if (!Array.isArray(list)) throw new Error('Ungültiges Format: kein "entries"-Array gefunden.');

    let count = 0;
    for (const raw of list as Record<string, unknown>[]) {
      const key = raw.date as string | undefined;
      if (!key) continue;
      const entry: TagesEintrag = {
        typ: (raw.typ as TagesEintrag['typ']) || 'A',
        typManuell: true,
        ho: Boolean(raw.ho),
        start: (raw.start as string) || '', ende: (raw.ende as string) || '', pause: String(raw.pause ?? ''),
        beschreibung: (raw.beschreibung as string) || '',
        km: String(raw.km ?? ''), transport: String(raw.transport ?? ''), hotel: String(raw.hotel ?? ''),
        bewirtung: String(raw.bewirtung ?? ''), sonstiges: String(raw.sonstiges ?? ''),
        reiseland: (raw.reiseland as TagesEintrag['reiseland']) || 'Deutschland',
        reiseart: (raw.reiseart as TagesEintrag['reiseart']) || '',
        fr: Boolean(raw.fr), mi: Boolean(raw.mi), ab: Boolean(raw.ab),
        receiptIds: [],
      };
      await saveEntry(key, entry);
      count++;
    }
    return { count };
  } catch (err) {
    return { count: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
