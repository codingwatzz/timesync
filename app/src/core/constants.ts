import type { Reiseart, Reiseland, Wochentyp } from './types';

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

// Feste Werte für die Spesenabrechnungs-Exportdateien - Ein-Personen-App, kein Eingabefeld
// nötig (Nutzerwunsch 04.09.2026: "Name soll automatisch vergeben werden").
export const SPESEN_NAME_VOLL = 'Raoul Hübner'; // steht im Dokument selbst (Name-Feld)
export const SPESEN_NAME_DATEI = 'Raoul'; // Kurzform im Dateinamen, z.B. "..._Raoul.xlsx"
