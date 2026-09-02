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
