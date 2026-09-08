import type { TagesEintrag, Wochentyp } from '../core/types';
import type { KVStore } from '../store/types';
import { dateKey, defaultTyp } from '../core/holidays';
import { emptyEntry, hatVersteckbareDaten } from '../core/entry';
import { loadEntry } from '../hooks/entryStorage';

export interface BulkTypDay {
  key: string;
  /** Hat dieser Tag bereits Zeiten/Kosten/Belege (siehe hatVersteckbareDaten)? Steuert, ob der
   * Bestätigungsdialog vor dem Anwenden nachfragt, wie damit umgegangen werden soll. */
  hasData: boolean;
}

export interface BulkTypPlan {
  typ: Wochentyp;
  von: string;
  bis: string;
  /** Nur Werktage (Wochenenden/Feiertage sind automatisch bereits ausgeschlossen). */
  days: BulkTypDay[];
  /** Anzahl der im Zeitraum liegenden, aber übersprungenen Wochenend-/Feiertage. */
  skipped: number;
}

function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

function naechsterTag(key: string): string {
  const { year, month, day } = parseDateKey(key);
  const dt = new Date(year, month - 1, day + 1);
  return dateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/** Nutzerwunsch 07.09.2026: mehrere Tage in Folge auf einen Tagestyp setzen (z.B. 2 Wochen
 * Urlaub), ohne Wochenenden/Feiertage einzeln anklicken zu müssen - die werden automatisch
 * übersprungen (macht bei "Urlaub eintragen" ohnehin keinen Sinn, an Tagen, die schon
 * arbeitsfrei sind). Reine Lesevorgänge, noch KEIN Schreibzugriff - siehe applyBulkTypPlan(). */
export async function buildBulkTypPlan(
  store: KVStore, von: string, bis: string, typ: Wochentyp,
): Promise<BulkTypPlan> {
  const days: BulkTypDay[] = [];
  let skipped = 0;
  // Sicherheitsgrenze gegen einen versehentlich riesigen/vertauschten Zeitraum (z.B. Jahre
  // statt Tage vertauscht) - ein Jahr ist bereits weit über jedem plausiblen Anwendungsfall.
  const MAX_TAGE = 366;
  let key = von;
  for (let i = 0; i < MAX_TAGE && key <= bis; i++) {
    const { year, month, day } = parseDateKey(key);
    if (defaultTyp(year, month, day) !== 'A') {
      skipped++;
    } else {
      const existing = await loadEntry(store, key);
      days.push({ key, hasData: existing ? hatVersteckbareDaten(existing) : false });
    }
    key = naechsterTag(key);
  }
  return { typ, von, bis, days, skipped };
}

export interface ApplyBulkTypResult {
  succeeded: number;
  failedKeys: string[];
}

/** Schreibt einen zuvor bestätigten Plan tatsächlich in den Store - jeder Tag unabhängig
 * (ein Fehlschlag blockiert nicht die restlichen, gleiches Prinzip wie beim Import). Ändert
 * IMMER nur `typ`+`typManuell` (wie beim Einzeltag-Wechsel in DetailSheet.tsx::setTyp()) -
 * `keepData: false` löscht zusätzlich die sonst bei "kein Arbeitstag" ausgeblendeten Felder
 * (Zeiten/Fahrt&Kosten/Verpflegung/Belege-Referenzen - NICHT Sonstiges/Beschreibung, die
 * bleiben immer erhalten). Löscht dabei NUR die Referenzen (receiptIds), nicht die
 * hochgeladenen Beleg-Dateien selbst - ein absichtlich vorsichtiger Kompromiss, verwaiste
 * Dateien sind eine bekannte, akzeptierte Karteileiche (siehe CLAUDE_CHECKLIST.md), ein
 * unwiderrufliches Löschen echter Dateien in einer Sammel-Aktion wäre das größere Risiko. */
export async function applyBulkTypPlan(
  store: KVStore,
  plan: BulkTypPlan,
  saveEntry: (key: string, data: TagesEintrag) => Promise<void>,
  keepData: boolean,
): Promise<ApplyBulkTypResult> {
  let succeeded = 0;
  const failedKeys: string[] = [];
  for (const d of plan.days) {
    try {
      const { year, month, day } = parseDateKey(d.key);
      const existing = await loadEntry(store, d.key);
      const base = existing ?? emptyEntry(year, month, day);
      const next: TagesEintrag = keepData
        ? { ...base, typ: plan.typ, typManuell: true }
        : {
            ...base, typ: plan.typ, typManuell: true,
            start: '', ende: '', pause: '', start2: '', ende2: '', pause2: '',
            km: '', transport: '', hotel: '', bewirtung: '',
            reiseland: 'Deutschland', reiseart: '', fr: false, mi: false, ab: false,
            receiptIds: [],
          };
      await saveEntry(d.key, next);
      succeeded++;
    } catch {
      failedKeys.push(d.key);
    }
  }
  return { succeeded, failedKeys };
}
