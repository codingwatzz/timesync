// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DetailSheet } from '../DetailSheet';
import { emptyEntry } from '../../core/entry';
import { StoreContext } from '../../hooks/storeContextDefinition';
import type { KVStore } from '../../store/types';

function makeStore(): KVStore {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue({ key: 'x', value: '' }),
    delete: vi.fn().mockResolvedValue({ key: 'x', deleted: true as const }),
  };
}

function renderSheet(props: Partial<React.ComponentProps<typeof DetailSheet>> = {}) {
  const store = makeStore();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const entry = emptyEntry(2026, 9, 15);
  const utils = render(
    <StoreContext.Provider value={{ store, mode: 'appwrite', log: [] }}>
      <DetailSheet dateKey="2026-09-15" entry={entry} onSave={onSave} onClose={onClose} showToast={() => {}} {...props} />
    </StoreContext.Provider>,
  );
  const beschreibung = () => utils.container.querySelector<HTMLTextAreaElement>('#f_beschreibung')!;
  const sonstiges = () => utils.container.querySelector<HTMLInputElement>('#f_sonstiges');
  const km = () => utils.container.querySelector<HTMLInputElement>('#f_km');
  return { ...utils, onSave, onClose, beschreibung, sonstiges, km };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('DetailSheet Auto-Save', () => {
  it('speichert automatisch ~1s nach einer Eingabe, ohne Klick auf "Speichern"', async () => {
    const { onSave, beschreibung } = renderSheet();
    fireEvent.change(beschreibung(), { target: { value: 'Kundentermin' } });
    expect(onSave).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('2026-09-15', expect.objectContaining({ beschreibung: 'Kundentermin' }));
  });

  it('fasst mehrere schnelle Eingaben zu einem einzigen Save zusammen', async () => {
    const { onSave, beschreibung } = renderSheet();
    const feld = beschreibung();
    fireEvent.change(feld, { target: { value: 'K' } });
    await vi.advanceTimersByTimeAsync(400);
    fireEvent.change(feld, { target: { value: 'Ku' } });
    await vi.advanceTimersByTimeAsync(400);
    fireEvent.change(feld, { target: { value: 'Kundentermin' } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('2026-09-15', expect.objectContaining({ beschreibung: 'Kundentermin' }));
  });

  it('speichert sofort beim Schließen, auch wenn der Debounce noch nicht abgelaufen ist', () => {
    const { onSave, onClose, beschreibung } = renderSheet();
    fireEvent.change(beschreibung(), { target: { value: 'Kundentermin' } });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Schließen'));
    expect(onSave).toHaveBeenCalledWith('2026-09-15', expect.objectContaining({ beschreibung: 'Kundentermin' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('speichert nicht erneut, wenn nach dem Speichern keine weitere Änderung erfolgte', async () => {
    const { onSave, beschreibung } = renderSheet();
    fireEvent.change(beschreibung(), { target: { value: 'Kundentermin' } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Schließen'));
    expect(onSave).toHaveBeenCalledTimes(1); // kein zusätzlicher Save ohne neue Änderung
  });
});

describe('DetailSheet Beleg-Vorschau', () => {
  const receiptMeta = {
    id: 'r1', name: 'test-beleg.pdf', mime: 'application/pdf',
    dataUrl: 'data:application/pdf;base64,AAAA', createdAt: 1700000000000, date: '2026-09-15',
  };

  function storeWithReceipt() {
    return {
      get: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'receipt:r1') return { key, value: JSON.stringify(receiptMeta) };
        return null;
      }),
      set: vi.fn().mockResolvedValue({ key: 'x', value: '' }),
      delete: vi.fn().mockResolvedValue({ key: 'x', deleted: true as const }),
    };
  }

  it('öffnet das PDF in einem neuen Tab (Blob-URL), wenn auf den Beleg geklickt wird', async () => {
    vi.useRealTimers();
    const store = storeWithReceipt();
    const entry = { ...emptyEntry(2026, 9, 15), receiptIds: ['r1'] };
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    vi.spyOn(window, 'fetch').mockResolvedValue({ blob: async () => blob } as Response);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const { container } = render(
      <StoreContext.Provider value={{ store, mode: 'appwrite', log: [] }}>
        <DetailSheet dateKey="2026-09-15" entry={entry} onSave={vi.fn()} onClose={vi.fn()} showToast={() => {}} />
      </StoreContext.Provider>,
    );

    const item = await screen.findByText('test-beleg.pdf');
    fireEvent.click(item.closest('.receipt-item')!);
    await vi.waitFor(() => expect(openSpy).toHaveBeenCalledWith('blob:mock-url', '_blank'));
    expect(container.querySelector('.receipt-item')).toHaveAttribute('role', 'button');
  });

  it('löscht den Beleg, ohne die Vorschau zu öffnen, wenn auf "×" geklickt wird', async () => {
    vi.useRealTimers();
    const store = storeWithReceipt();
    const entry = { ...emptyEntry(2026, 9, 15), receiptIds: ['r1'] };
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <StoreContext.Provider value={{ store, mode: 'appwrite', log: [] }}>
        <DetailSheet dateKey="2026-09-15" entry={entry} onSave={vi.fn().mockResolvedValue(undefined)} onClose={vi.fn()} showToast={() => {}} />
      </StoreContext.Provider>,
    );

    await screen.findByText('test-beleg.pdf');
    fireEvent.click(screen.getByText('×'));
    expect(store.delete).toHaveBeenCalledWith('receipt:r1');
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe('DetailSheet Wisch-Navigation', () => {
  function touch(x: number, y: number) {
    return { touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] };
  }

  it('ruft onNavigateDay(1) bei einer Wisch-Geste nach links auf (nächster Tag)', () => {
    const onNavigateDay = vi.fn();
    const { container } = renderSheet({ onNavigateDay });
    const sheet = container.querySelector('.sheet')!;
    fireEvent.touchStart(sheet, touch(300, 200));
    fireEvent.touchEnd(sheet, touch(150, 200));
    expect(onNavigateDay).toHaveBeenCalledWith(1);
  });

  it('ruft onNavigateDay(-1) bei einer Wisch-Geste nach rechts auf (voriger Tag)', () => {
    const onNavigateDay = vi.fn();
    const { container } = renderSheet({ onNavigateDay });
    const sheet = container.querySelector('.sheet')!;
    fireEvent.touchStart(sheet, touch(100, 200));
    fireEvent.touchEnd(sheet, touch(250, 200));
    expect(onNavigateDay).toHaveBeenCalledWith(-1);
  });
});

describe('DetailSheet Sonstiges € an allen Tagen', () => {
  it('zeigt "Sonstiges €" auch an einem Homeoffice-Tag (nicht nur bei "vor Ort")', () => {
    const entry = { ...emptyEntry(2026, 9, 15), ho: true };
    const { sonstiges } = renderSheet({ entry });
    expect(sonstiges()).not.toBeNull();
  });

  it('zeigt "Sonstiges €" auch an einem Urlaubstag', () => {
    const entry = { ...emptyEntry(2026, 9, 15), typ: 'U' as const };
    const { sonstiges } = renderSheet({ entry });
    expect(sonstiges()).not.toBeNull();
  });

  it('zeigt "Fahrt & Kosten" (km/Transport) weiterhin NICHT an einem Homeoffice-Tag', () => {
    const entry = { ...emptyEntry(2026, 9, 15), ho: true };
    const { km } = renderSheet({ entry });
    expect(km()).not.toBeVisible();
  });
});

describe('DetailSheet Arbeitszeit-Anzeige', () => {
  it('zeigt die berechnete Arbeitszeit (hh:mm) neben "Zeiten" an', () => {
    const entry = { ...emptyEntry(2026, 9, 15), start: '08:00', ende: '16:30', pause: '30' };
    const { container } = renderSheet({ entry });
    expect(container.querySelector('.arbeitszeit-badge')?.textContent).toBe('08:00');
  });

  it('berücksichtigt die zweite Schicht in der angezeigten Arbeitszeit', () => {
    const entry = {
      ...emptyEntry(2026, 9, 15),
      start: '08:00', ende: '12:00', pause: '0',
      start2: '17:00', ende2: '19:00', pause2: '0',
    };
    const { container } = renderSheet({ entry });
    expect(container.querySelector('.arbeitszeit-badge')?.textContent).toBe('06:00');
  });

  it('zeigt 00:00, wenn keine Zeiten eingetragen sind', () => {
    const { container } = renderSheet();
    expect(container.querySelector('.arbeitszeit-badge')?.textContent).toBe('00:00');
  });
});

describe('DetailSheet Pausenzeit-Auswahl', () => {
  it('bietet die Pause als Auswahl in 15er-Schritten an (statt Texteingabe)', () => {
    const { container } = renderSheet();
    const select = container.querySelector<HTMLSelectElement>('#f_pause')!;
    expect(select.tagName).toBe('SELECT');
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['0', '15', '30', '45', '60', '75', '90', '105', '120', '135', '150', '165', '180']);
  });

  it('zeigt einen ungewöhnlichen Altwert (z.B. 20 Minuten) korrekt einsortiert an', () => {
    const entry = { ...emptyEntry(2026, 9, 15), pause: '20' };
    const { container } = renderSheet({ entry });
    const select = container.querySelector<HTMLSelectElement>('#f_pause')!;
    expect(select.value).toBe('20');
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain('20');
  });

  it('speichert den gewählten Pausenwert bei Auswahl', () => {
    const { container } = renderSheet();
    const select = container.querySelector<HTMLSelectElement>('#f_pause')!;
    fireEvent.change(select, { target: { value: '45' } });
    expect(select.value).toBe('45');
  });
});
