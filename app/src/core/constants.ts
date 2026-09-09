import type { BelegFeld, Reiseart, Reiseland, Wochentyp } from './types';

export const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;

export const MONATSNAMEN = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
] as const;

export const TYP_LABEL: Record<Wochentyp, string> = {
  A: 'Arbeit', W: 'Wochenende', F: 'Feiertag', U: 'Urlaub', K: 'Krank', G: 'Gleitfrei',
};

export const REISEARTEN: Reiseart[] = [
  '', 'Anreisetag', 'Abreisetag', 'Abwesenheitstag (<8h)', 'Abwesenheitstag (>8h)', 'Abwesenheitstag (24h)',
];

export const LAENDER: Reiseland[] = ['Deutschland', 'Österreich', 'Schweiz'];

export const BELEG_FELD_LABEL: Record<BelegFeld, string> = {
  '': '– kein Feld –',
  transport: 'Transport',
  hotel: 'Hotel',
  bewirtung: 'Bewirtung',
  sonstiges: 'Sonstiges',
};

/** Kostenfelder, die einem Beleg zuordenbar sind (Sonstiges bewusst mit dabei, obwohl es
 * außerhalb des "Fahrt & Kosten"-Blocks steht - siehe UX-Audit-Folgeauftrag 06.09.2026).
 * Zentral hier statt in DetailSheet.tsx, seit auch DayRow/useMonthEntries dieselbe Liste
 * für die "Beleg fehlt"-Warnung in der Monatsübersicht brauchen (08.09.2026). */
export const BELEG_ZUORDENBARE_FELDER = ['transport', 'hotel', 'bewirtung', 'sonstiges'] as const;

// Feste Werte für die Spesenabrechnungs-Exportdateien - Ein-Personen-App, kein Eingabefeld
// nötig (Nutzerwunsch 04.09.2026: "Name soll automatisch vergeben werden").
export const SPESEN_NAME_VOLL = 'Raoul Hübner'; // steht im Dokument selbst (Name-Feld)
export const SPESEN_NAME_DATEI = 'Raoul'; // Kurzform im Dateinamen, z.B. "..._Raoul.xlsx"
