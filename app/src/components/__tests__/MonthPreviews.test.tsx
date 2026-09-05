// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonthPreviews } from '../MonthPreviews';
import { leererEintrag as eintrag } from '../../lib/export/__tests__/testFixtures';
import type { TagesEintrag } from '../../core/types';

describe('MonthPreviews', () => {
  it('zeigt beide Tabellen zunächst NICHT (eingeklappt)', () => {
    render(<MonthPreviews year={2026} month={8} entries={{}} />);
    expect(screen.queryByText('Keine kosten-/reiserelevanten Tage in diesem Monat.')).not.toBeInTheDocument();
    expect(screen.queryByText('GESAMT')).not.toBeInTheDocument();
  });

  it('klappt die Spesenabrechnung-Vorschau beim Klick auf', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-04': eintrag({ beschreibung: 'Kundentermin', km: '20' }),
    };
    render(<MonthPreviews year={2026} month={8} entries={entries} />);
    fireEvent.click(screen.getByText(/Spesenabrechnung-Vorschau/));
    expect(screen.getByText('Kundentermin')).toBeInTheDocument();
  });

  it('klappt die Arbeitszeiten-Vorschau beim Klick auf', () => {
    render(<MonthPreviews year={2026} month={8} entries={{}} />);
    fireEvent.click(screen.getByText(/Arbeitszeiten-Vorschau/));
    expect(screen.getByText('GESAMT')).toBeInTheDocument();
  });

  it('ist ein Akkordeon - öffnet man das eine Panel, schließt sich das andere', () => {
    render(<MonthPreviews year={2026} month={8} entries={{}} />);
    fireEvent.click(screen.getByText(/Arbeitszeiten-Vorschau/));
    expect(screen.getByText('GESAMT')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Spesenabrechnung-Vorschau/));
    expect(screen.queryByText('GESAMT')).not.toBeInTheDocument();
  });

  it('schließt ein offenes Panel bei erneutem Klick auf denselben Toggle', () => {
    render(<MonthPreviews year={2026} month={8} entries={{}} />);
    fireEvent.click(screen.getByText(/Arbeitszeiten-Vorschau/));
    expect(screen.getByText('GESAMT')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Arbeitszeiten-Vorschau/));
    expect(screen.queryByText('GESAMT')).not.toBeInTheDocument();
  });
});
