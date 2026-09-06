// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildImportPlan, applyImportPlan, downloadPreImportBackup } from '../importPlan';
import type { ImportCandidate } from '../exportImport';
import type { TagesEintrag } from '../../core/types';
import type { KVStore } from '../../store/types';

function makeEntry(overrides: Partial<TagesEintrag> = {}): TagesEintrag {
  return {
    typ: 'A', typManuell: true, ho: false,
    start: '', ende: '', pause: '0', start2: '', ende2: '', pause2: '',
    beschreibung: '', km: '', transport: '', hotel: '', bewirtung: '', sonstiges: '',
    reiseland: 'Deutschland', reiseart: '', fr: false, mi: false, ab: false, receiptIds: [],
    ...overrides,
  };
}

describe('buildImportPlan', () => {
  it('erkennt, welche Tage bereits Daten haben (würden überschrieben) und welche neu sind', async () => {
    const existingEntry = makeEntry({ beschreibung: 'Bestehend' });
    const store: KVStore = {
      get: vi.fn(async (key: string) =>
        key === 'entry:2028-12-01' ? { key, value: JSON.stringify(existingEntry) } : null),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const candidates: ImportCandidate[] = [
      { key: '2028-12-01', data: makeEntry({ beschreibung: 'Neu 1' }) },
      { key: '2028-12-05', data: makeEntry({ beschreibung: 'Neu 2' }) },
    ];
    const plan = await buildImportPlan(store, candidates);
    expect(plan.overwriteKeys).toEqual(['2028-12-01']);
    expect(plan.newKeys).toEqual(['2028-12-05']);
    expect(plan.existing['2028-12-01'].beschreibung).toBe('Bestehend');
    expect(plan.fromKey).toBe('2028-12-01');
    expect(plan.toKey).toBe('2028-12-05');
  });

  it('markiert nichts als Überschreibung, wenn kein Tag bereits Daten hat', async () => {
    const store: KVStore = { get: vi.fn(async () => null), set: vi.fn(), delete: vi.fn() };
    const candidates: ImportCandidate[] = [{ key: '2028-12-01', data: makeEntry() }];
    const plan = await buildImportPlan(store, candidates);
    expect(plan.overwriteKeys).toEqual([]);
    expect(plan.newKeys).toEqual(['2028-12-01']);
  });
});

describe('applyImportPlan', () => {
  it('schreibt jeden Kandidaten über saveEntry und gibt die Anzahl zurück', async () => {
    const saveEntry = vi.fn();
    const plan = {
      candidates: [
        { key: '2028-12-01', data: makeEntry() },
        { key: '2028-12-02', data: makeEntry() },
      ],
      existing: {}, overwriteKeys: [], newKeys: ['2028-12-01', '2028-12-02'],
      fromKey: '2028-12-01', toKey: '2028-12-02',
    };
    const count = await applyImportPlan(plan, saveEntry);
    expect(count).toBe(2);
    expect(saveEntry).toHaveBeenCalledTimes(2);
    expect(saveEntry).toHaveBeenCalledWith('2028-12-01', plan.candidates[0].data);
  });
});

describe('downloadPreImportBackup', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
  });

  it('löst einen Download NUR für die überschriebenen Tage aus, nicht für alle Kandidaten', () => {
    const plan = {
      candidates: [
        { key: '2028-12-01', data: makeEntry() },
        { key: '2028-12-02', data: makeEntry() },
      ],
      existing: { '2028-12-01': makeEntry({ beschreibung: 'Alter Stand' }) },
      overwriteKeys: ['2028-12-01'], newKeys: ['2028-12-02'],
      fromKey: '2028-12-01', toKey: '2028-12-02',
    };
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });

    downloadPreImportBackup(plan);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(clickSpy).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });
});
