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
