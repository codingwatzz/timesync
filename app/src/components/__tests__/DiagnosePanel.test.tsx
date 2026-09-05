// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiagnosePanel } from '../DiagnosePanel';

describe('DiagnosePanel', () => {
  it('zeigt sich NICHT als "offen" (Klasse "show"), wenn open=false', () => {
    const { container } = render(<DiagnosePanel mode="appwrite" log={[]} open={false} onClose={vi.fn()} />);
    expect(container.querySelector('#debugOverlay.show')).not.toBeInTheDocument();
  });

  it('zeigt sich als "offen", wenn open=true, und zeigt den Speicher-Modus + Log', () => {
    const { container } = render(<DiagnosePanel mode="indexeddb" log={['Zeile 1', 'Zeile 2']} open onClose={vi.fn()} />);
    expect(container.querySelector('#debugOverlay.show')).toBeInTheDocument();
    expect(screen.getByText(/Lokal \(IndexedDB\)/)).toBeInTheDocument();
    expect(screen.getByText(/Zeile 1/)).toBeInTheDocument();
  });

  it('ruft onClose beim Klick auf "Schließen" auf', () => {
    const onClose = vi.fn();
    render(<DiagnosePanel mode="appwrite" log={[]} open onClose={onClose} />);
    fireEvent.click(screen.getByText('Schließen'));
    expect(onClose).toHaveBeenCalled();
  });
});
