// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExportView } from '../ExportView';
import { emptyEntry } from '../../core/entry';
import type { TagesEintrag } from '../../core/types';

describe('ExportView', () => {
  it('zeigt einen Hinweis, wenn keine kosten-/reiserelevanten Tage vorhanden sind', () => {
    render(<ExportView year={2026} month={8} entries={{}} store={null} onBack={() => {}} showToast={() => {}} />);
    expect(screen.getByText('Keine kosten-/reiserelevanten Tage in diesem Monat.')).toBeInTheDocument();
  });

  it('zeigt die Summe korrekt formatiert (deutsches Komma)', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-17': { ...emptyEntry(2026, 8, 17), transport: '15.50', hotel: '90' },
    };
    render(<ExportView year={2026} month={8} entries={entries} store={null} onBack={() => {}} showToast={() => {}} />);
    expect(screen.getByText(/105,50 € Kosten gesamt/)).toBeInTheDocument();
  });

  it('zeigt den Export-Button immer, auch ohne kosten-/reiserelevante Tage (Arbeitszeiten betreffen den ganzen Monat)', () => {
    render(<ExportView year={2026} month={8} entries={{}} store={null} onBack={() => {}} showToast={() => {}} />);
    expect(screen.getByText(/Export herunterladen/)).toBeInTheDocument();
  });
});
