import { describe, it, expect } from 'vitest';
import { ostersonntag, feiertagName, defaultTyp, dateKey } from '../holidays';

describe('ostersonntag', () => {
  // Referenzwerte: offiziell bestätigte Osterdaten
  const erwartet: Record<number, string> = {
    2026: '2026-04-05',
    2027: '2027-03-28',
    2028: '2028-04-16',
    2029: '2029-04-01',
    2030: '2030-04-21',
  };

  for (const [jahr, datum] of Object.entries(erwartet)) {
    it(`berechnet Ostersonntag ${jahr} korrekt`, () => {
      const d = ostersonntag(Number(jahr));
      expect(dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate())).toBe(datum);
    });
  }
});

describe('feiertagName', () => {
  it('erkennt Neujahr', () => {
    expect(feiertagName(2026, 1, 1)).toBe('Neujahr');
  });

  it('erkennt Weihnachten (fixe Feiertage)', () => {
    expect(feiertagName(2026, 12, 25)).toBe('1. Weihnachtsfeiertag');
    expect(feiertagName(2026, 12, 26)).toBe('2. Weihnachtsfeiertag');
  });

  it('erkennt bewegliche Feiertage 2026 (abhängig von Ostern 5.4.2026)', () => {
    expect(feiertagName(2026, 4, 3)).toBe('Karfreitag');
    expect(feiertagName(2026, 4, 6)).toBe('Ostermontag');
    expect(feiertagName(2026, 5, 14)).toBe('Christi Himmelfahrt');
    expect(feiertagName(2026, 5, 25)).toBe('Pfingstmontag');
    expect(feiertagName(2026, 6, 4)).toBe('Fronleichnam');
  });

  it('gibt null für normale Tage zurück', () => {
    expect(feiertagName(2026, 8, 15)).toBeNull();
  });

  it('funktioniert auch für weit in der Zukunft liegende Jahre ohne manuelle Pflege', () => {
    expect(feiertagName(2035, 1, 1)).toBe('Neujahr');
    expect(feiertagName(2035, 12, 25)).toBe('1. Weihnachtsfeiertag');
  });
});

describe('defaultTyp', () => {
  it('erkennt Wochenenden', () => {
    // 15.08.2026 ist ein Samstag
    expect(defaultTyp(2026, 8, 15)).toBe('W');
  });

  it('erkennt normale Arbeitstage', () => {
    // 17.08.2026 ist ein Montag
    expect(defaultTyp(2026, 8, 17)).toBe('A');
  });

  it('priorisiert Feiertag über Wochentag-Logik', () => {
    expect(defaultTyp(2026, 12, 25)).toBe('F');
  });
});
