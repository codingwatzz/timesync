import type { TagesEintrag } from '../core/types';

export { dateKey } from '../core/holidays';

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
        start2: (raw.start2 as string) || '', ende2: (raw.ende2 as string) || '', pause2: String(raw.pause2 ?? ''),
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
