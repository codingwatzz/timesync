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

  it('EXTRA-Zelle trägt NIE gleichzeitig text-text UND text-success/text-danger (Regressionstest' +
     ' für den 29.09.2026 gemeldeten Bug "keine Farben zu sehen" - beide Klassen gleichzeitig' +
     ' führten dazu, dass die im generierten CSS zuletzt stehende Regel (text-text) IMMER' +
     ' gewann, unabhängig vom tatsächlichen Vorzeichen)', () => {
    // Eine Woche mit klar positivem UND eine mit klar negativem Extra, damit beide Fälle
    // (nicht nur der neutrale) durchlaufen werden.
    const entries: Record<string, TagesEintrag> = {
      '2026-08-17': eintrag({ typ: 'A', start: '08:00', ende: '20:00', pause: '' }), // deutlich +Extra
      '2026-08-18': eintrag({ typ: 'A', start: '08:00', ende: '09:00', pause: '' }), // deutlich -Extra
    };
    const b = berechneArbeitszeit(2026, 8, entries);
    const tag17 = b.zeilen.find((z) => z.art === 'tag' && z.datum.getDate() === 17);
    const tag18 = b.zeilen.find((z) => z.art === 'tag' && z.datum.getDate() === 18);
    expect(tag17?.art === 'tag' && tag17.extra > 0).toBe(true);
    expect(tag18?.art === 'tag' && tag18.extra < 0).toBe(true);

    const { container } = render(<ArbeitszeitPreviewTable berechnung={b} />);
    const zellen = Array.from(container.querySelectorAll('td'));
    const positivZelle = zellen.find((td) => td.className.includes('text-success'));
    const negativZelle = zellen.find((td) => td.className.includes('text-danger'));
    expect(positivZelle).toBeDefined();
    expect(negativZelle).toBeDefined();
    expect(positivZelle!.className).not.toMatch(/\btext-text\b/);
    expect(negativZelle!.className).not.toMatch(/\btext-text\b/);
  });
});
