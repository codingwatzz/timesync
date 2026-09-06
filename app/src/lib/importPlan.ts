import type { TagesEintrag } from '../core/types';
import type { KVStore } from '../store/types';
import type { ImportCandidate } from './exportImport';
import { loadEntry } from '../hooks/entryStorage';
import { triggerDownload } from './download';

/**
 * Ergebnis von buildImportPlan(): welche Tage aus der Import-Datei bereits bestehende Daten
 * überschreiben würden (siehe UX-Review 06.09.2026, Punkt 4.1) - reine Lesevorgänge, noch
 * KEIN Schreibzugriff.
 */
export interface ImportPlan {
  candidates: ImportCandidate[];
  /** Aktuell gespeicherte Version JEDES Tages, der überschrieben würde (key -> alter Stand). */
  existing: Record<string, TagesEintrag>;
  overwriteKeys: string[];
  newKeys: string[];
  fromKey: string | null;
  toKey: string | null;
}

export async function buildImportPlan(store: KVStore, candidates: ImportCandidate[]): Promise<ImportPlan> {
  const existingList = await Promise.all(candidates.map((c) => loadEntry(store, c.key)));
  const existing: Record<string, TagesEintrag> = {};
  const overwriteKeys: string[] = [];
  const newKeys: string[] = [];
  candidates.forEach((c, i) => {
    const e = existingList[i];
    if (e) { existing[c.key] = e; overwriteKeys.push(c.key); } else { newKeys.push(c.key); }
  });
  const sortedAllKeys = candidates.map((c) => c.key).slice().sort();
  return {
    candidates,
    existing,
    overwriteKeys: overwriteKeys.sort(),
    newKeys: newKeys.sort(),
    fromKey: sortedAllKeys[0] ?? null,
    toKey: sortedAllKeys[sortedAllKeys.length - 1] ?? null,
  };
}

/**
 * Lädt eine Sicherheitskopie NUR der Tage herunter, die dieser Import überschreiben würde -
 * mit ihrem AKTUELLEN, noch unveränderten Stand. Rein optionaler Komfort-Schutz VOR dem
 * eigentlichen Import (siehe ImportConfirmDialog.tsx) - keine Pflicht, aber ein Klick, bevor
 * eine potenziell folgenschwere Aktion bestätigt wird.
 */
export function downloadPreImportBackup(plan: ImportPlan): void {
  const payload = {
    hinweis:
      'Sicherheitskopie der Tage, die ein Import überschreiben würde - erzeugt unmittelbar ' +
      'VOR dem eigentlichen Import, damit der bisherige Stand notfalls wiederhergestellt ' +
      'werden kann (manuell, kein automatischer Restore vorhanden).',
    erzeugtAm: new Date().toISOString(),
    entries: plan.overwriteKeys.map((key) => ({ date: key, ...plan.existing[key] })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `Sicherheitskopie-vor-Import-${new Date().toISOString().slice(0, 10)}.json`);
}

/** Schreibt einen zuvor vom Nutzer bestätigten Plan tatsächlich in den Store. Verarbeitet
 * JEDEN Kandidaten unabhängig (ein einzelner Fehlschlag blockiert nicht die restlichen, gute
 * Einträge) und meldet am Ende, wie viele wirklich ankamen und welche Schlüssel fehlschlugen -
 * saveEntry() kann seit dem Engineering-Review 07.09.2026 (Punkt 2) bei einem echten
 * Speicherfehler werfen, statt lautlos "erfolgreich" zu tun. */
export interface ApplyImportResult {
  succeeded: number;
  failedKeys: string[];
}

export async function applyImportPlan(
  plan: ImportPlan,
  saveEntry: (key: string, data: TagesEintrag) => Promise<void>,
): Promise<ApplyImportResult> {
  let succeeded = 0;
  const failedKeys: string[] = [];
  for (const c of plan.candidates) {
    try {
      await saveEntry(c.key, c.data);
      succeeded++;
    } catch {
      failedKeys.push(c.key);
    }
  }
  return { succeeded, failedKeys };
}
