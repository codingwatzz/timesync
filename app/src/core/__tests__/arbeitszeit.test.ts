import { describe, it, expect } from 'vitest';
import { berechneArbeitszeit, SOLL_MINUTEN_PRO_ARBEITSTAG } from '../arbeitszeit';
import { leererEintrag as eintrag } from '../../lib/export/__tests__/testFixtures';
import type { TagesEintrag } from '../types';

describe('berechneArbeitszeit', () => {
  it('berechnet IST/SOLL/EXTRA für einen einzelnen Arbeitstag korrekt', () => {
    // 17.08.2026 ist ein Montag
    const entries: Record<string, TagesEintrag> = {
      '2026-08-17': eintrag({ typ: 'A', start: '08:00', ende: '16:24', pause: '' }),
    };
    const b = berechneArbeitszeit(2026, 8, entries);
    const tag = b.zeilen.find((z) => z.art === 'tag' && z.datum.getDate() === 17);
    expect(tag).toBeDefined();
    if (tag?.art === 'tag') {
      expect(tag.ist).toBe(504); // 8:24h
      expect(tag.soll).toBe(SOLL_MINUTEN_PRO_ARBEITSTAG);
      expect(tag.extra).toBe(504 - SOLL_MINUTEN_PRO_ARBEITSTAG);
    }
  });

  it('rechnet Wochenende/Feiertag/Urlaub/Krank/Gleitfrei mit SOLL=0', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-15': eintrag({ typ: 'W' }), // Samstag
      '2026-08-18': eintrag({ typ: 'U' }),
      '2026-08-19': eintrag({ typ: 'K' }),
      '2026-08-20': eintrag({ typ: 'G' }),
    };
    const b = berechneArbeitszeit(2026, 8, entries);
    for (const key of [18, 19, 20]) {
      const tag = b.zeilen.find((z) => z.art === 'tag' && z.datum.getDate() === key);
      expect(tag?.art === 'tag' && tag.soll).toBe(0);
    }
  });

  it('blendet Wochenendtage ohne Arbeitszeit aus, zählt sie aber in den Summen mit', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-15': eintrag({ typ: 'W' }), // kein Eintrag an Arbeitszeit -> ausgeblendet
      '2026-08-16': eintrag({ typ: 'W', start: '09:00', ende: '11:00', pause: '' }), // gearbeitet -> sichtbar
    };
    const b = berechneArbeitszeit(2026, 8, entries);
    const tag15 = b.zeilen.find((z) => z.art === 'tag' && z.datum.getDate() === 15);
    const tag16 = b.zeilen.find((z) => z.art === 'tag' && z.datum.getDate() === 16);
    expect(tag15).toBeUndefined();
    expect(tag16).toBeDefined();
  });

  it('erzeugt eine Wochensumme-Zeile, sobald eine Kalenderwoche mit Inhalt endet', () => {
    // KW34 2026: Mo 17.08. - So 23.08.
    const entries: Record<string, TagesEintrag> = {
      '2026-08-17': eintrag({ typ: 'A', start: '08:00', ende: '16:24', pause: '' }),
      '2026-08-24': eintrag({ typ: 'A', start: '08:00', ende: '16:24', pause: '' }), // KW35, Montag
    };
    const b = berechneArbeitszeit(2026, 8, entries);
    const wochensummen = b.zeilen.filter((z) => z.art === 'wochensumme');
    expect(wochensummen.length).toBeGreaterThanOrEqual(1);
  });

  it('summiert Gesamt-IST/SOLL über den ganzen Monat korrekt (unbelegte Werktage zählen automatisch als Arbeitstag mit IST=0, siehe core/entry.ts::emptyEntry)', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-03': eintrag({ typ: 'A', start: '08:00', ende: '16:24', pause: '' }), // Montag, +0
      '2026-08-04': eintrag({ typ: 'A', start: '08:00', ende: '17:24', pause: '' }), // +60 Extra
    };
    const b = berechneArbeitszeit(2026, 8, entries);
    // August 2026 hat 21 Werktage (Mo-Fr) - alle unbelegten zaehlen automatisch mit SOLL,
    // aber IST=0 (kein Eintrag = keine Zeit erfasst).
    expect(b.gesamtSoll).toBe(SOLL_MINUTEN_PRO_ARBEITSTAG * 21);
    expect(b.gesamtIst).toBe(504 + 564); // nur die beiden explizit erfassten Tage
    expect(b.gesamtExtra).toBe(504 + 564 - SOLL_MINUTEN_PRO_ARBEITSTAG * 21);
  });

  it('berechnet die Homeoffice-Quote nur über echte Arbeitstage (unbelegte Werktage zaehlen automatisch als nicht-Homeoffice-Arbeitstag mit, siehe emptyEntry: ho=true default - hier daher explizit fuer den ganzen Monat gesetzt)', () => {
    const entries: Record<string, TagesEintrag> = {};
    // Ganzen August explizit auf Urlaub setzen (zaehlt nicht als Arbeitstag), dann zwei Tage
    // gezielt als echte Arbeitstage ueberschreiben - so ist der Rest des Monats garantiert
    // isoliert und beeinflusst die Quote nicht.
    for (let d = 1; d <= 31; d++) {
      entries[`2026-08-${String(d).padStart(2, '0')}`] = eintrag({ typ: 'U' });
    }
    entries['2026-08-03'] = eintrag({ typ: 'A', ho: true });
    entries['2026-08-04'] = eintrag({ typ: 'A', ho: false });
    const b = berechneArbeitszeit(2026, 8, entries);
    expect(b.arbeitstageGesamt).toBe(2);
    expect(b.homeofficeTage).toBe(1);
    expect(b.homeofficeQuote).toBe(0.5);
  });

  it('zählt Tage pro Typ korrekt (gesamtProTyp), isoliert vom Rest des Monats', () => {
    const entries: Record<string, TagesEintrag> = {};
    for (let d = 1; d <= 31; d++) {
      entries[`2026-08-${String(d).padStart(2, '0')}`] = eintrag({ typ: 'G' }); // neutraler Fuellwert
    }
    entries['2026-08-03'] = eintrag({ typ: 'U' });
    entries['2026-08-04'] = eintrag({ typ: 'K' });
    const b = berechneArbeitszeit(2026, 8, entries);
    expect(b.gesamtProTyp.U).toBe(1);
    expect(b.gesamtProTyp.K).toBe(1);
  });

  it('füllt einen komplett leeren Monat automatisch anhand des Wochentags auf (August 2026: 21 Werktage)', () => {
    const b = berechneArbeitszeit(2026, 8, {});
    expect(b.gesamtIst).toBe(0); // keine erfassten Zeiten
    expect(b.arbeitstageGesamt).toBe(21); // trotzdem 21 Werktage als "Arbeitstag" gezaehlt
    expect(b.homeofficeQuote).toBe(1); // emptyEntry() default: ho=true
  });

  it('schließt Tage nach dem bisDatum aus (Vorschau: nur bis heute)', () => {
    // 03.08. und 04.08. sind beide Arbeitstage; bisDatum=03.08. → 04.08. darf nicht einfließen
    const entries: Record<string, TagesEintrag> = {};
    for (let d = 1; d <= 31; d++) {
      entries[`2026-08-${String(d).padStart(2, '0')}`] = eintrag({ typ: 'G' }); // neutral
    }
    entries['2026-08-03'] = eintrag({ typ: 'A', start: '08:00', ende: '16:24', pause: '' });
    entries['2026-08-04'] = eintrag({ typ: 'A', start: '08:00', ende: '16:24', pause: '' });

    const bisDatum = new Date(2026, 7, 3); // 03.08.2026
    const b = berechneArbeitszeit(2026, 8, entries, bisDatum);
    expect(b.arbeitstageGesamt).toBe(1); // nur 03.08., nicht 04.08.
    expect(b.gesamtIst).toBe(504); // nur eine Schicht à 8:24h
  });

  it('ignoriert bisDatum, wenn es weggelassen wird (Export: ganzer Monat)', () => {
    const entries: Record<string, TagesEintrag> = {};
    for (let d = 1; d <= 31; d++) {
      entries[`2026-08-${String(d).padStart(2, '0')}`] = eintrag({ typ: 'G' });
    }
    entries['2026-08-03'] = eintrag({ typ: 'A', start: '08:00', ende: '16:24', pause: '' });
    entries['2026-08-04'] = eintrag({ typ: 'A', start: '08:00', ende: '16:24', pause: '' });

    const b = berechneArbeitszeit(2026, 8, entries);
    expect(b.arbeitstageGesamt).toBe(2);
  });
});
