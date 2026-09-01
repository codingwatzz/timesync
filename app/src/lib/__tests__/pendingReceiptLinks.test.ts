// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  markPendingReceiptLink,
  clearPendingReceiptLink,
  repairPendingReceiptLinks,
} from '../pendingReceiptLinks';
import type { KVStore } from '../../store/types';

function makeStore(overrides: Partial<KVStore> = {}): KVStore {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockImplementation(async (key: string, value: string) => ({ key, value })),
    delete: vi.fn().mockResolvedValue({ key: 'x', deleted: true as const }),
    ...overrides,
  };
}

function entryRow(receiptIds: string[]) {
  return JSON.stringify({
    typ: 'A', typManuell: false, ho: false, start: '', ende: '', pause: '',
    start2: '', ende2: '', pause2: '', beschreibung: '', km: '', transport: '',
    hotel: '', bewirtung: '', sonstiges: '', reiseland: '', reiseart: '',
    fr: false, mi: false, ab: false, receiptIds,
  });
}

function receiptRow() {
  return JSON.stringify({ id: 'r1', name: 'foto.pdf', mime: 'application/pdf', createdAt: 1, date: '2026-08-04' });
}

beforeEach(() => {
  localStorage.clear();
});

describe('markPendingReceiptLink / clearPendingReceiptLink', () => {
  it('legt einen Vermerk in localStorage an und entfernt ihn wieder', () => {
    markPendingReceiptLink('2026-08-04', 'r1');
    expect(localStorage.length).toBe(1);
    clearPendingReceiptLink('2026-08-04', 'r1');
    expect(localStorage.length).toBe(0);
  });
});

describe('repairPendingReceiptLinks', () => {
  it('ergänzt die fehlende receiptId, wenn Eintrag und Beleg existieren', async () => {
    markPendingReceiptLink('2026-08-04', 'r1');
    const store = makeStore({
      get: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'entry:2026-08-04') return { key, value: entryRow([]) };
        if (key === 'receipt:r1') return { key, value: receiptRow() };
        return null;
      }),
    });
    await repairPendingReceiptLinks(store, () => {});
    expect(store.set).toHaveBeenCalledWith('entry:2026-08-04', expect.stringContaining('"r1"'));
    expect(localStorage.length).toBe(0); // Vermerk wurde aufgeräumt
  });

  it('lässt den Vermerk stehen, wenn der Tageseintrag noch nicht existiert', async () => {
    markPendingReceiptLink('2026-08-04', 'r1');
    const store = makeStore({
      get: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'receipt:r1') return { key, value: receiptRow() };
        return null; // entry:2026-08-04 existiert nicht
      }),
    });
    await repairPendingReceiptLinks(store, () => {});
    expect(store.set).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(1); // Vermerk bleibt für den nächsten Versuch
  });

  it('räumt den Vermerk auf, wenn der Beleg selbst nicht mehr existiert', async () => {
    markPendingReceiptLink('2026-08-04', 'r1');
    const store = makeStore(); // get() liefert überall null
    await repairPendingReceiptLinks(store, () => {});
    expect(store.set).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('räumt nur auf, ohne zu speichern, wenn die Verknüpfung bereits vorhanden ist', async () => {
    markPendingReceiptLink('2026-08-04', 'r1');
    const store = makeStore({
      get: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'entry:2026-08-04') return { key, value: entryRow(['r1']) };
        if (key === 'receipt:r1') return { key, value: receiptRow() };
        return null;
      }),
    });
    await repairPendingReceiptLinks(store, () => {});
    expect(store.set).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('lässt den Vermerk stehen, wenn das Speichern fehlschlägt (nächster Versuch beim nächsten Start)', async () => {
    markPendingReceiptLink('2026-08-04', 'r1');
    const store = makeStore({
      get: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'entry:2026-08-04') return { key, value: entryRow([]) };
        if (key === 'receipt:r1') return { key, value: receiptRow() };
        return null;
      }),
      set: vi.fn().mockRejectedValue(new Error('Netzwerkfehler')),
    });
    await repairPendingReceiptLinks(store, () => {});
    expect(localStorage.length).toBe(1);
  });
});
