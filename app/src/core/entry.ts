import type { TagesEintrag } from './types';
import { defaultTyp } from './holidays';
import { toNumber } from './formatters';

export function emptyEntry(year: number, month: number, day: number): TagesEintrag {
  return {
    typ: defaultTyp(year, month, day),
    typManuell: false,
    ho: true,
    start: '', ende: '', pause: '',
    start2: '', ende2: '', pause2: '',
    beschreibung: '',
    km: '', transport: '', hotel: '', bewirtung: '', sonstiges: '',
    reiseland: 'Deutschland', reiseart: '',
    fr: false, mi: false, ab: false,
    receiptIds: [],
  };
}

/** Summe aus Transport, Hotel, Bewirtung, Sonstiges (ohne KM-Pauschale/VMA, wie in Excel). */
export function tagesKosten(e: Pick<TagesEintrag, 'transport' | 'hotel' | 'bewirtung' | 'sonstiges'>): number {
  return toNumber(e.transport) + toNumber(e.hotel) + toNumber(e.bewirtung) + toNumber(e.sonstiges);
}

/** Ist dieser Tag ein "vor Ort"-Tag (für Spesenabrechnung relevant)? */
export function istVorOrtTag(e: TagesEintrag | undefined): boolean {
  if (!e || e.ho || e.typ !== 'A') return false;
  return Boolean(e.transport || e.hotel || e.bewirtung || e.km || e.reiseart);
}

/**
 * Berechnet die tatsächliche Arbeitszeit in Minuten: (Ende - Start - Pause) für die erste
 * Schicht, plus (Ende2 - Start2 - Pause2) für die zweite Schicht, falls befüllt. Unvollständige
 * (Start oder Ende fehlt) oder unplausible (Ende vor Start) Schichten zählen als 0 Minuten,
 * statt einen Fehler zu werfen oder eine negative Zeit anzuzeigen.
 */
export function arbeitszeitMinuten(
  e: Pick<TagesEintrag, 'start' | 'ende' | 'pause' | 'start2' | 'ende2' | 'pause2'>,
): number {
  function schichtMinuten(start: string, ende: string, pause: string): number {
    if (!start || !ende) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = ende.split(':').map(Number);
    if (![sh, sm, eh, em].every(Number.isFinite)) return 0;
    const dauer = (eh * 60 + em) - (sh * 60 + sm) - toNumber(pause);
    return Math.max(0, dauer);
  }
  return schichtMinuten(e.start, e.ende, e.pause) + schichtMinuten(e.start2, e.ende2, e.pause2);
}
