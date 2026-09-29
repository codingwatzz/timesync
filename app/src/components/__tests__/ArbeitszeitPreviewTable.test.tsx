// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArbeitszeitPreviewTable } from '../ArbeitszeitPreviewTable';
import { berechneArbeitszeit } from '../../core/arbeitszeit';
import { leererEintrag as eintrag } from '../../lib/export/__tests__/testFixtures';
import type { TagesEintrag } from '../../core/types';

describe('ArbeitszeitPreviewTable', () => {
  it('zeigt die GESAMT-Zeile mit IST/SOLL/EXTRA', () => {
    const b = berechneArbeitszeit(2026, 8, {});
    render(<ArbeitszeitPreviewTable berechnung={b} />);
    expect(screen.getByText('GESAMT')).toBeInTheDocument();
  });

  it('zeigt die Homeoffice-Quote und Tages-Zähler', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-03': eintrag({ typ: 'U' }),
    };
    const b = berechneArbeitszeit(2026, 8, entries);
    render(<ArbeitszeitPreviewTable berechnung={b} />);
    expect(screen.getByText(/Homeoffice-Quote/)).toBeInTheDocument();
    expect(screen.getByText(/Urlaub: 1/)).toBeInTheDocument();
  });

  it('markiert einen Tag mit "(HO)", wenn Homeoffice gesetzt ist (isoliert: restlicher Monat explizit auf Urlaub, sonst zählt jeder unbelegte Werktag automatisch als Homeoffice-Arbeitstag mit, siehe emptyEntry())', () => {
    const entries: Record<string, TagesEintrag> = {};
    for (let d = 1; d <= 31; d++) {
      entries[`2026-08-${String(d).padStart(2, '0')}`] = eintrag({ typ: 'U' });
    }
    entries['2026-08-03'] = eintrag({ typ: 'A', ho: true, start: '08:00', ende: '16:24', pause: '' });
    const b = berechneArbeitszeit(2026, 8, entries);
    render(<ArbeitszeitPreviewTable berechnung={b} />);
    expect(screen.getByText(/\(HO\)/)).toBeInTheDocument();
  });

  it('zeigt in der Wochensumme-Zeile Extra UND die %-Abweichung (nicht nur bei GESAMT)', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-17': eintrag({ typ: 'A', start: '08:00', ende: '16:24', pause: '' }),
      '2026-08-24': eintrag({ typ: 'A', start: '08:00', ende: '16:24', pause: '' }),
    };
    const b = berechneArbeitszeit(2026, 8, entries);
    render(<ArbeitszeitPreviewTable berechnung={b} />);
    expect(screen.getAllByText('Wochensumme').length).toBeGreaterThanOrEqual(1);
    // %-Zeichen kommt jetzt auch in mind. einer Wochensumme-Zeile vor, nicht nur bei GESAMT
    const prozentTreffer = screen.getAllByText(/\(.*%\)/);
    expect(prozentTreffer.length).toBeGreaterThanOrEqual(2); // mind. 1x Wochensumme + 1x GESAMT
  });

  it('Tages-Zeile hat KEINE Farbklasse mehr bei EXTRA (Nutzerwunsch 29.09.2026: Farbe nur' +
     ' bei Wochensumme und GESAMT, nicht pro einzelnem Tag)', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-17': eintrag({ typ: 'A', start: '08:00', ende: '20:00', pause: '' }), // deutlich +Extra
      '2026-08-18': eintrag({ typ: 'A', start: '08:00', ende: '09:00', pause: '' }), // deutlich -Extra
    };
    const b = berechneArbeitszeit(2026, 8, entries);
    const { container } = render(<ArbeitszeitPreviewTable berechnung={b} />);
    // Nur die Tages-Zeilen selektieren (arbeitszeit-wochensumme/arbeitszeit-gesamt ausschließen)
    const tagesZellen = Array.from(container.querySelectorAll('tbody tr:not(.arbeitszeit-wochensumme) td'));
    expect(tagesZellen.length).toBeGreaterThan(0);
    for (const zelle of tagesZellen) {
      expect(zelle.className).not.toMatch(/text-success|text-danger/);
    }
  });

  it('Wochensumme UND GESAMT tragen weiterhin genau eine Textfarb-Klasse, nie text-text' +
     ' gleichzeitig mit text-success/text-danger (Regressionstest für den 29.09.2026' +
     ' gemeldeten Bug "keine Farben zu sehen" - beide Klassen gleichzeitig führten dazu, dass' +
     ' die im generierten CSS zuletzt stehende Regel (text-text) IMMER gewann, unabhängig vom' +
     ' tatsächlichen Vorzeichen)', () => {
    // KW34 (17.-21.08.): Montag mit deutlichem Plus, Di-Fr bewusst auf Urlaub (SOLL=0), damit
    // NUR Montags IST/SOLL in die Wochensumme einfließt -> eindeutig positive Woche.
    // KW35 (24.-28.08.): Montag mit deutlichem Minus, Di-Fr ebenso auf Urlaub -> eindeutig
    // negative Woche. So sind beide Vorzeichen gezielt (nicht nur zufällig) abgedeckt.
    const entries: Record<string, TagesEintrag> = {
      '2026-08-17': eintrag({ typ: 'A', start: '08:00', ende: '20:00', pause: '' }),
      '2026-08-18': eintrag({ typ: 'U' }), '2026-08-19': eintrag({ typ: 'U' }),
      '2026-08-20': eintrag({ typ: 'U' }), '2026-08-21': eintrag({ typ: 'U' }),
      '2026-08-24': eintrag({ typ: 'A', start: '08:00', ende: '09:00', pause: '' }),
      '2026-08-25': eintrag({ typ: 'U' }), '2026-08-26': eintrag({ typ: 'U' }),
      '2026-08-27': eintrag({ typ: 'U' }), '2026-08-28': eintrag({ typ: 'U' }),
    };
    const b = berechneArbeitszeit(2026, 8, entries);
    const wochensummen = b.zeilen.filter((z) => z.art === 'wochensumme');
    const kw34 = wochensummen.find((z) => z.art === 'wochensumme' && z.extra > 0);
    const kw35 = wochensummen.find((z) => z.art === 'wochensumme' && z.extra < 0);
    expect(kw34).toBeDefined();
    expect(kw35).toBeDefined();

    const { container } = render(<ArbeitszeitPreviewTable berechnung={b} />);
    const wochensummenZellen = Array.from(container.querySelectorAll('tr.arbeitszeit-wochensumme td'));
    const gesamtZelle = container.querySelector('tr.arbeitszeit-gesamt td:last-child');

    const positivZelle = wochensummenZellen.find((td) => td.className.includes('text-success'));
    const negativZelle = wochensummenZellen.find((td) => td.className.includes('text-danger'));
    expect(positivZelle).toBeDefined();
    expect(negativZelle).toBeDefined();
    expect(positivZelle!.className).not.toMatch(/\btext-text\b/);
    expect(negativZelle!.className).not.toMatch(/\btext-text\b/);

    expect(gesamtZelle).toBeTruthy();
    expect(gesamtZelle!.className).toMatch(/text-success|text-danger/);
    expect(gesamtZelle!.className).not.toMatch(/\btext-text\b/);
  });
});
