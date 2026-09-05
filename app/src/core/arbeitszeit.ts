// Reine Berechnungslogik für die Arbeitszeiten-Übersicht - bewusst OHNE jede Excel-/DOM-
// Abhängigkeit (gehört deshalb zu core/, nicht zu lib/export/), damit sowohl der .xlsx-Export
// (arbeitszeitExport.ts) als auch die In-App-Vorschau (ArbeitszeitPreview.tsx) exakt dieselbe
// Berechnung verwenden - vorher steckte diese Logik direkt im Excel-Schreib-Code, eine
// zweite Implementierung für die Vorschau hätte real auseinanderlaufen können.

import type { TagesEintrag, Wochentyp } from './types';
import { dateKey } from './holidays';
import { emptyEntry, arbeitszeitMinuten } from './entry';
import { daysInMonth, pad } from './formatters';

// 6:24h - gilt nur an echten Arbeitstagen (Typ 'A'). Wochenende, Feiertag, Urlaub, Krank und
// Gleitfrei fließen NICHT ins SOLL ein (Nutzerentscheidung 04.09.2026: "Nur echte Arbeitstage").
export const SOLL_MINUTEN_PRO_ARBEITSTAG = 6 * 60 + 24;

export type ArbeitszeitZeile =
  | {
      art: 'tag'; datum: Date; typ: Wochentyp; ho: boolean;
      start: string; ende: string; pause: string;
      start2: string; ende2: string; pause2: string;
      ist: number; soll: number; extra: number;
    }
  | { art: 'wochensumme'; ist: number; soll: number; extra: number }
  | { art: 'leerzeile' };

export interface ArbeitszeitBerechnung {
  /** Anzeige-Reihenfolge: Tages-Zeilen, dazwischen Wochensummen + Leerzeilen. */
  zeilen: ArbeitszeitZeile[];
  gesamtIst: number;
  gesamtSoll: number;
  gesamtExtra: number;
  gesamtProzent: number;
  arbeitstageGesamt: number;
  homeofficeTage: number;
  homeofficeQuote: number;
  gesamtProTyp: Record<Wochentyp, number>;
}

/** Montag der Kalenderwoche, die `datum` enthält - Gruppierungsschlüssel für die
 * Wochen-Zwischensummen. */
function montagDerWoche(datum: Date): string {
  const wochentagIso = (datum.getDay() + 6) % 7; // Mo=0 ... So=6
  const montag = new Date(datum);
  montag.setDate(datum.getDate() - wochentagIso);
  return `${montag.getFullYear()}-${pad(montag.getMonth() + 1)}-${pad(montag.getDate())}`;
}

export function berechneArbeitszeit(
  year: number, month: number, entries: Record<string, TagesEintrag>,
): ArbeitszeitBerechnung {
  const n = daysInMonth(year, month);
  const zeilen: ArbeitszeitZeile[] = [];

  let wochenAkkumulator = { ist: 0, soll: 0 };
  let aktuelleWoche: string | null = null;

  const gesamtProTyp: Record<Wochentyp, number> = { A: 0, W: 0, F: 0, U: 0, K: 0, G: 0 };
  let arbeitstageGesamt = 0;
  let homeofficeTage = 0;
  let gesamtIst = 0;
  let gesamtSoll = 0;

  for (let d = 1; d <= n; d++) {
    const e = entries[dateKey(year, month, d)] ?? emptyEntry(year, month, d);
    const datum = new Date(year, month - 1, d);
    const ist = arbeitszeitMinuten(e);
    const soll = e.typ === 'A' ? SOLL_MINUTEN_PRO_ARBEITSTAG : 0;
    const extra = ist - soll;

    const woche = montagDerWoche(datum);
    if (aktuelleWoche !== null && woche !== aktuelleWoche) {
      const wocheHatteInhalt = wochenAkkumulator.ist !== 0 || wochenAkkumulator.soll !== 0;
      if (wocheHatteInhalt) {
        zeilen.push({ art: 'wochensumme', ...wochenAkkumulator, extra: wochenAkkumulator.ist - wochenAkkumulator.soll });
        zeilen.push({ art: 'leerzeile' });
      }
      wochenAkkumulator = { ist: 0, soll: 0 };
    }
    aktuelleWoche = woche;

    // Wochenendtage ohne dokumentierte Arbeitszeit werden nicht als eigene Zeile gezeigt
    // (Nutzerwunsch 04.09.2026) - zählen aber weiterhin korrekt in Wochen-/Gesamtsummen mit.
    const zeileAnzeigen = e.typ !== 'W' || ist > 0;
    if (zeileAnzeigen) {
      zeilen.push({
        art: 'tag', datum, typ: e.typ, ho: e.ho,
        start: e.start, ende: e.ende, pause: e.pause,
        start2: e.start2, ende2: e.ende2, pause2: e.pause2,
        ist, soll, extra,
      });
    }

    wochenAkkumulator.ist += ist;
    wochenAkkumulator.soll += soll;
    gesamtProTyp[e.typ]++;
    if (e.typ === 'A') {
      arbeitstageGesamt++;
      if (e.ho) homeofficeTage++;
    }
    gesamtIst += ist;
    gesamtSoll += soll;
  }

  if (wochenAkkumulator.ist !== 0 || wochenAkkumulator.soll !== 0) {
    zeilen.push({ art: 'wochensumme', ...wochenAkkumulator, extra: wochenAkkumulator.ist - wochenAkkumulator.soll });
  }

  const gesamtExtra = gesamtIst - gesamtSoll;
  const gesamtProzent = gesamtSoll > 0 ? (gesamtExtra / gesamtSoll) * 100 : 0;
  const homeofficeQuote = arbeitstageGesamt > 0 ? homeofficeTage / arbeitstageGesamt : 0;

  return {
    zeilen, gesamtIst, gesamtSoll, gesamtExtra, gesamtProzent,
    arbeitstageGesamt, homeofficeTage, homeofficeQuote, gesamtProTyp,
  };
}
