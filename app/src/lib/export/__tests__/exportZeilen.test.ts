import { describe, it, expect } from 'vitest';
import { entriesToZeilen, summe, kmPauschale, vma } from '../exportZeilen';
import { leererEintrag as eintrag } from './testFixtures';
import type { TagesEintrag } from '../../../core/types';

describe('entriesToZeilen', () => {
  it('schließt Tage ohne Kosten und ohne Reiseart aus', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-03': eintrag({ typ: 'A' }), // keine Kosten, kein km, kein reiseart
    };
    expect(entriesToZeilen(2026, 8, entries)).toHaveLength(0);
  });

  it('schließt Tage mit Kosten ein', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-03': eintrag({ sonstiges: '50' }),
      '2026-08-04': eintrag({ km: '100' }),
      '2026-08-05': eintrag({ transport: '30' }),
    };
    expect(entriesToZeilen(2026, 8, entries)).toHaveLength(3);
  });

  it('schließt Tage mit Reiseart ein, auch ohne monetäre Kosten', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-03': eintrag({ reiseart: 'Abreisetag', reiseland: 'Deutschland' }),
    };
    expect(entriesToZeilen(2026, 8, entries)).toHaveLength(1);
  });

  it('behandelt die interne <8h-Markierung als "kein VMA-Anspruch"', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-03': eintrag({ reiseart: 'Abwesenheitstag (<8h)', km: '50' }),
    };
    const zeilen = entriesToZeilen(2026, 8, entries);
    expect(zeilen).toHaveLength(1); // km-relevant, also drin
    expect(zeilen[0].reiseart).toBeNull(); // aber kein VMA
  });
});

describe('kmPauschale', () => {
  it('berechnet 0,30€ pro km', () => {
    const z = entriesToZeilen(2026, 8, { '2026-08-03': eintrag({ km: '100' }) })[0];
    expect(kmPauschale(z)).toBeCloseTo(30, 5);
  });

  it('ist 0, wenn kein km-Eintrag vorhanden', () => {
    const z = entriesToZeilen(2026, 8, { '2026-08-03': eintrag({ sonstiges: '10' }) })[0];
    expect(kmPauschale(z)).toBe(0);
  });
});

describe('vma', () => {
  it('berechnet einen VMA-Betrag für Abreisetag Deutschland', () => {
    const z = entriesToZeilen(2026, 8, {
      '2026-08-03': eintrag({ reiseart: 'Abreisetag', reiseland: 'Deutschland' }),
    })[0];
    expect(vma(z)).toBeGreaterThan(0);
  });

  it('ist 0 ohne Reiseart', () => {
    const z = entriesToZeilen(2026, 8, { '2026-08-03': eintrag({ km: '50' }) })[0];
    expect(vma(z)).toBe(0);
  });
});

describe('summe', () => {
  it('addiert alle Kostenpositionen korrekt', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-03': eintrag({ km: '100', transport: '20', sonstiges: '15' }),
    };
    const z = entriesToZeilen(2026, 8, entries)[0];
    // 100km * 0,30€ + 20€ Transport + 15€ Sonstiges = 30 + 20 + 15 = 65€
    expect(summe(z)).toBeCloseTo(65, 5);
  });
});
