// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
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

  it('warnt vor vergangenen Arbeitstagen ohne erfasste Arbeitszeit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4)); // "heute" = 04.09.2026
    try {
      // September 2026: 01./02./03. sind Di/Mi/Do (Arbeitstage), keine Einträge vorhanden.
      render(<ExportView year={2026} month={9} entries={{}} store={null} onBack={() => {}} showToast={() => {}} />);
      expect(screen.getByText(/3 Arbeitstage ohne erfasste Arbeitszeit/)).toBeInTheDocument();
      expect(screen.getByText(/01\.09\., 02\.09\., 03\.09\./)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('zeigt KEINE Warnung, wenn für alle vergangenen Arbeitstage eine Arbeitszeit erfasst ist', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4));
    try {
      const entries: Record<string, TagesEintrag> = {
        '2026-09-01': { ...emptyEntry(2026, 9, 1), start: '08:00', ende: '16:00' },
        '2026-09-02': { ...emptyEntry(2026, 9, 2), start: '08:00', ende: '16:00' },
        '2026-09-03': { ...emptyEntry(2026, 9, 3), start: '08:00', ende: '16:00' },
      };
      render(<ExportView year={2026} month={9} entries={entries} store={null} onBack={() => {}} showToast={() => {}} />);
      expect(screen.queryByText(/Arbeitstag(e)? ohne erfasste Arbeitszeit/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
