// Reine Export-Zeilen-Logik (keine Abhängigkeit zu JSZip o.ä.) - kann bedenkenlos statisch
// importiert werden (z.B. für die Vorschau-Tabelle), ohne den Hauptbundle unnötig zu
// vergrößern. Die eigentliche xlsx-Erzeugung (mit JSZip) lebt in lib/xlsxExport.ts und wird
// von dort per dynamic import() nur bei tatsächlichem Bedarf nachgeladen.

import type { TagesEintrag, Reiseart, Reiseland } from '../../core/types';
import { verpflegungsmehraufwand } from '../../core/vma';
import { dateKey } from '../../core/holidays';
import { daysInMonth } from '../../core/formatters';

// Rein interne App-Markierung, kein Wert aus der echten Vorlage - muss beim Export wie
// leer/kein Anspruch behandelt werden (siehe core/vma.ts).
const INTERNE_MARKIERUNG_REISEART = 'Abwesenheitstag (<8h)';

function toNumber(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export interface ExportZeile {
  datum: Date;
  beschreibung: string;
  hotel: number;
  transport: number;
  bewirtung: number;
  km: number | null;
  sonstiges: number;
  reiseland: Reiseland;
  reiseart: Reiseart | null; // null = kein VMA-Anspruch (auch <8h-Markierung -> null)
  fr: boolean;
  mi: boolean;
  ab: boolean;
}

export function kmPauschale(z: ExportZeile): number {
  return Math.round((z.km ?? 0) * 0.3 * 1e10) / 1e10;
}

export function vma(z: ExportZeile): number {
  if (z.reiseart === null) return 0;
  return verpflegungsmehraufwand(z.reiseland, z.reiseart, { fr: z.fr, mi: z.mi, ab: z.ab });
}

export function summe(z: ExportZeile): number {
  return z.hotel + z.transport + z.bewirtung + kmPauschale(z) + vma(z) + z.sonstiges;
}

function istRelevanterTag(e: TagesEintrag): boolean {
  const kosten = toNumber(e.km) > 0 || toNumber(e.transport) > 0 || toNumber(e.hotel) > 0
    || toNumber(e.bewirtung) > 0 || toNumber(e.sonstiges) > 0;
  return kosten || Boolean(e.reiseart);
}

/** Baut die Export-Zeilen aus den App-Tageseinträgen eines Monats - wählt Kosten- oder
 * Reiseart-relevante Tage aus (siehe istRelevanterTag oben). */
export function entriesToZeilen(year: number, month: number, entries: Record<string, TagesEintrag>): ExportZeile[] {
  const n = daysInMonth(year, month);
  const zeilen: ExportZeile[] = [];
  for (let d = 1; d <= n; d++) {
    const e = entries[dateKey(year, month, d)];
    if (!e || !istRelevanterTag(e)) continue;
    const reiseart = e.reiseart || '';
    zeilen.push({
      datum: new Date(year, month - 1, d),
      beschreibung: e.beschreibung || '',
      hotel: toNumber(e.hotel), transport: toNumber(e.transport), bewirtung: toNumber(e.bewirtung),
      km: toNumber(e.km) || null,
      sonstiges: toNumber(e.sonstiges),
      reiseland: e.reiseland || 'Deutschland',
      reiseart: (reiseart === '' || reiseart === INTERNE_MARKIERUNG_REISEART) ? null : reiseart,
      fr: Boolean(e.fr), mi: Boolean(e.mi), ab: Boolean(e.ab),
    });
  }
  return zeilen;
}
