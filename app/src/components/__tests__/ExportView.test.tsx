// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportView } from '../ExportView';
import { emptyEntry } from '../../core/entry';
import type { ExportZeile } from '../../core/types';

describe('ExportView', () => {
  it('zeigt einen Hinweis, wenn keine Vor-Ort-Tage vorhanden sind', () => {
    render(<ExportView year={2026} month={8} rows={[]} receiptCount={0} onBack={() => {}} onDownload={() => {}} />);
    expect(screen.getByText('Keine Vor-Ort-Tage in diesem Monat.')).toBeInTheDocument();
  });

  it('zeigt die Summe korrekt formatiert (deutsches Komma)', () => {
    const rows: ExportZeile[] = [
      { ...emptyEntry(2026, 8, 17), date: '2026-08-17', transport: '15.50', hotel: '90' },
    ];
    render(<ExportView year={2026} month={8} rows={rows} receiptCount={0} onBack={() => {}} onDownload={() => {}} />);
    expect(screen.getByText(/105,50 € Kosten gesamt/)).toBeInTheDocument();
  });

  it('zeigt den Download-Button nur, wenn es Zeilen gibt', () => {
    const { rerender } = render(
      <ExportView year={2026} month={8} rows={[]} receiptCount={0} onBack={() => {}} onDownload={() => {}} />,
    );
    expect(screen.queryByText(/Exportdatei herunterladen/)).not.toBeInTheDocument();

    const rows: ExportZeile[] = [{ ...emptyEntry(2026, 8, 17), date: '2026-08-17' }];
    rerender(<ExportView year={2026} month={8} rows={rows} receiptCount={0} onBack={() => {}} onDownload={() => {}} />);
    expect(screen.getByText(/Exportdatei herunterladen/)).toBeInTheDocument();
  });

  it('ruft onDownload beim Klick auf den Download-Button auf', () => {
    const onDownload = vi.fn();
    const rows: ExportZeile[] = [{ ...emptyEntry(2026, 8, 17), date: '2026-08-17' }];
    render(<ExportView year={2026} month={8} rows={rows} receiptCount={0} onBack={() => {}} onDownload={onDownload} />);
    fireEvent.click(screen.getByText(/Exportdatei herunterladen/));
    expect(onDownload).toHaveBeenCalledOnce();
  });
});
