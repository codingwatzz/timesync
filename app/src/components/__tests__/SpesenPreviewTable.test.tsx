// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpesenPreviewTable } from '../SpesenPreviewTable';
import type { ExportZeile } from '../../lib/export/exportZeilen';

function zeile(overrides: Partial<ExportZeile> = {}): ExportZeile {
  return {
    datum: new Date(2026, 8, 3),
    beschreibung: 'Testfahrt',
    hotel: 0, transport: 0, bewirtung: 0, sonstiges: 0,
    km: 50,
    reiseland: 'Deutschland',
    reiseart: null,
    fr: false, mi: false, ab: false,
    ...overrides,
  };
}

describe('SpesenPreviewTable', () => {
  it('zeigt Leer-Meldung wenn keine Zeilen vorhanden', () => {
    render(<SpesenPreviewTable zeilen={[]} />);
    expect(screen.getByText(/Keine kosten-\/reiserelevanten Tage/)).toBeInTheDocument();
    expect(screen.queryByText('GESAMT')).not.toBeInTheDocument();
  });

  it('rendert Datum und Beschreibung einer Zeile', () => {
    render(<SpesenPreviewTable zeilen={[zeile({ beschreibung: 'Kundentermin' })]} />);
    expect(screen.getByText('Kundentermin')).toBeInTheDocument();
    expect(screen.getByText('03.09.')).toBeInTheDocument();
  });

  it('zeigt die GESAMT-Zeile mit km-Summe und €-Summe, wenn mindestens eine Zeile vorhanden', () => {
    const zeilen: ExportZeile[] = [
      zeile({ km: 30, sonstiges: 10 }),
      zeile({ km: 20, sonstiges: 5 }),
    ];
    render(<SpesenPreviewTable zeilen={zeilen} />);
    expect(screen.getByText('GESAMT')).toBeInTheDocument();
    // km-Summe: 50 (beide Einträge, km-Pauschale à 0,30€/km → 15,00€ gesamt)
    expect(screen.getByText('50')).toBeInTheDocument();
    // €-Summe: 10 + 5 sonstiges = 15€ + kmPauschale 15€ = 30€
    expect(screen.getByText('30,00')).toBeInTheDocument();
  });

  it('zeigt "–" in km-Spalte der GESAMT-Zeile, wenn keine km-Einträge', () => {
    const zeilen: ExportZeile[] = [
      zeile({ km: null, sonstiges: 50 }),
    ];
    render(<SpesenPreviewTable zeilen={zeilen} />);
    const gesamtRow = screen.getByText('GESAMT').closest('tr')!;
    expect(gesamtRow.textContent).toContain('–');
    expect(gesamtRow.textContent).toContain('50,00');
  });
});
