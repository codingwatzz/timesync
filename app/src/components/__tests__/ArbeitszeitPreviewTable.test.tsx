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
});
