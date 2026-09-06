import type { TagesEintrag } from '../core/types';

export { dateKey } from '../core/holidays';

export interface ImportCandidate {
  key: string; // YYYY-MM-DD
  data: TagesEintrag;
}

export interface ParseResult {
  candidates: ImportCandidate[];
  error?: string;
}

/**
 * Liest + VALIDIERT eine Import-/Backup-JSON-Datei, schreibt aber noch NICHTS in den Store
 * (siehe UX-Review 06.09.2026, Punkt 4.1). Vorher schrieb diese Funktion jeden enthaltenen
 * Eintrag sofort und ohne Rückfrage in den Store - ein falscher Klick im Datei-Picker (z.B.
 * ein altes Backup) konnte dadurch unbemerkt bestehende Tage überschreiben. Das eigentliche
 * Schreiben übernimmt jetzt erst lib/importPlan.ts::applyImportPlan(), NACHDEM der Nutzer eine
 * Übersicht (Anzahl Einträge, wie viele bestehende Tage überschrieben würden) bestätigt hat -
 * siehe components/ImportConfirmDialog.tsx.
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
