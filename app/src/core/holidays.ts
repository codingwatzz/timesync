// Gesetzliche Feiertage Rheinland-Pfalz: 9 bundesweite + Fronleichnam + Allerheiligen.
// Wird für jedes Jahr automatisch berechnet (inkl. beweglicher Feiertage, die vom
// Ostersonntag abhängen) - funktioniert für 2026 und alle Folgejahre ohne manuelle Pflege.
//
// Reine Funktionen, keine DOM-/Browser-Abhängigkeit -> vollständig unit-testbar.

import { pad } from './formatters';

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Ostersonntag nach der Gaußschen Osterformel (gregorianischer Kalender). */
export function ostersonntag(jahr: number): Date {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(jahr, monat - 1, tag); // Monat 0-indiziert in JS
}

function addTage(datum: Date, n: number): Date {
  const d = new Date(datum);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateKey(d: Date): string {
  return dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const feiertagsCache = new Map<number, Record<string, string>>();

export function feiertageFuerJahr(jahr: number): Record<string, string> {
  const cached = feiertagsCache.get(jahr);
  if (cached) return cached;

  const ostern = ostersonntag(jahr);
  const map: Record<string, string> = {
    [dateKey(jahr, 1, 1)]: 'Neujahr',
    [toDateKey(addTage(ostern, -2))]: 'Karfreitag',
    [toDateKey(addTage(ostern, 1))]: 'Ostermontag',
    [dateKey(jahr, 5, 1)]: 'Tag der Arbeit',
    [toDateKey(addTage(ostern, 39))]: 'Christi Himmelfahrt',
    [toDateKey(addTage(ostern, 50))]: 'Pfingstmontag',
    [toDateKey(addTage(ostern, 60))]: 'Fronleichnam',
    [dateKey(jahr, 10, 3)]: 'Tag der Deutschen Einheit',
    [dateKey(jahr, 11, 1)]: 'Allerheiligen',
    [dateKey(jahr, 12, 25)]: '1. Weihnachtsfeiertag',
    [dateKey(jahr, 12, 26)]: '2. Weihnachtsfeiertag',
  };
  feiertagsCache.set(jahr, map);
  return map;
}

export function feiertagName(year: number, month: number, day: number): string | null {
  return feiertageFuerJahr(year)[dateKey(year, month, day)] ?? null;
}

/** Standard-Tagestyp: Feiertag > Wochenende > Arbeitstag. */
export function defaultTyp(year: number, month: number, day: number): 'A' | 'W' | 'F' {
  if (feiertagName(year, month, day)) return 'F';
  const wd = new Date(year, month - 1, day).getDay();
  return wd === 0 || wd === 6 ? 'W' : 'A';
}

