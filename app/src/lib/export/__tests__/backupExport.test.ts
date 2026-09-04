import { describe, it, expect } from 'vitest';
import type { TagesEintrag } from '../../../core/types';
import type { KVStore } from '../../../store/types';
import { buildBackupJson } from '../backupExport';
import { leererEintrag as eintrag } from './testFixtures';

function mockStore(receipts: Record<string, { name?: string; dataUrl: string | null }>): KVStore {
  return {
    async get(key: string) {
      const rid = key.replace(/^receipt:/, '');
      const meta = receipts[rid];
      if (!meta) return null;
      return { key, value: JSON.stringify(meta) };
    },
    async set() { /* nicht gebraucht */ },
    async delete() { /* nicht gebraucht */ },
  } as unknown as KVStore;
}

describe('buildBackupJson', () => {
  it('enthält alle übergebenen Einträge unverändert', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-04': eintrag({ beschreibung: 'Kunde A', km: '50' }),
      '2026-08-05': eintrag({ typ: 'U' }),
    };
    const blob = await buildBackupJson(2026, 8, entries, mockStore({}));
    const backup = JSON.parse(await blob.text());

    expect(backup.format).toBe('zeiterfassung-backup-v1');
    expect(backup.year).toBe(2026);
    expect(backup.month).toBe(8);
    expect(backup.entries['2026-08-04'].beschreibung).toBe('Kunde A');
    expect(backup.entries['2026-08-04'].km).toBe('50');
    expect(backup.entries['2026-08-05'].typ).toBe('U');
  });

  it('lädt jeden referenzierten Beleg als echten Datei-Inhalt (dataUrl), nicht nur als Verweis', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-04': eintrag({ receiptIds: ['r1', 'r2'] }),
    };
    const store = mockStore({
      r1: { name: 'taxi.pdf', dataUrl: 'data:application/pdf;base64,AAAA' },
      r2: { name: 'hotel.pdf', dataUrl: 'data:application/pdf;base64,BBBB' },
    });
    const blob = await buildBackupJson(2026, 8, entries, store);
    const backup = JSON.parse(await blob.text());

    expect(backup.receipts.r1.dataUrl).toBe('data:application/pdf;base64,AAAA');
    expect(backup.receipts.r1.name).toBe('taxi.pdf');
    expect(backup.receipts.r2.dataUrl).toBe('data:application/pdf;base64,BBBB');
  });

  it('überspringt eine Beleg-Referenz, die ins Leere zeigt (z.B. schon gelöscht), statt abzustürzen', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-04': eintrag({ receiptIds: ['existiert-nicht'] }),
    };
    const blob = await buildBackupJson(2026, 8, entries, mockStore({}));
    const backup = JSON.parse(await blob.text());

    expect(backup.receipts['existiert-nicht']).toBeUndefined();
    expect(Object.keys(backup.receipts)).toHaveLength(0);
  });

  it('lädt jeden Beleg nur einmal, auch wenn mehrere Tage denselben referenzieren', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-04': eintrag({ receiptIds: ['geteilt'] }),
      '2026-08-05': eintrag({ receiptIds: ['geteilt'] }),
    };
    let callCount = 0;
    const store: KVStore = {
      async get(key: string) {
        callCount++;
        if (key === 'receipt:geteilt') return { key, value: JSON.stringify({ name: 'x.pdf', dataUrl: 'data:x' }) };
        return null;
      },
      async set() { return { key: '', value: '' }; },
      async delete() { return { key: '', deleted: true as const }; },
    };
    await buildBackupJson(2026, 8, entries, store);
    expect(callCount).toBe(1);
  });

  it('funktioniert mit einem leeren Monat (keine Einträge)', async () => {
    const blob = await buildBackupJson(2026, 8, {}, mockStore({}));
    const backup = JSON.parse(await blob.text());
    expect(backup.entries).toEqual({});
    expect(backup.receipts).toEqual({});
  });
});
