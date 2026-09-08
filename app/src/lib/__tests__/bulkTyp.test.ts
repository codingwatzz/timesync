// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildBulkTypPlan, applyBulkTypPlan } from '../bulkTyp';
import type { TagesEintrag } from '../../core/types';
import type { KVStore } from '../../store/types';
import { emptyEntry } from '../../core/entry';

function makeStore(entries: Record<string, TagesEintrag> = {}): KVStore {
  return {
    get: vi.fn(async (key: string) => {
      const dateKey = key.replace(/^entry:/, '');
      const e = entries[dateKey];
      return e ? { key, value: JSON.stringify(e) } : null;
    }),
    set: vi.fn(async (key: string, value: string) => ({ key, value })),
    delete: vi.fn(async () => ({ key: '', deleted: true as const })),
  };
}

describe('buildBulkTypPlan', () => {
  it('überspringt Wochenenden im Zeitraum automatisch (2026-08-01/02 = Sa/So)', async () => {
    const plan = await buildBulkTypPlan(makeStore(), '2026-08-01', '2026-08-03', 'U');
    // 01.=Sa, 02.=So, 03.=Mo -> nur der 03. ist ein Werktag
    expect(plan.days.map((d) => d.key)).toEqual(['2026-08-03']);
    expect(plan.skipped).toBe(2);
  });

  it('überspringt Feiertage im Zeitraum automatisch (01.01. Neujahr, ein Donnerstag - kein Wochenende)', async () => {
    const plan = await buildBulkTypPlan(makeStore(), '2026-01-01', '2026-01-02', 'U');
    expect(plan.days.map((d) => d.key)).toEqual(['2026-01-02']);
    expect(plan.skipped).toBe(1);
  });

  it('markiert Tage mit bereits erfassten Zeiten/Kosten/Belegen als hasData', async () => {
    const store = makeStore({
      '2026-08-03': { ...emptyEntry(2026, 8, 3), start: '08:00', ende: '16:00' },
    });
    const plan = await buildBulkTypPlan(store, '2026-08-03', '2026-08-04', 'U');
    expect(plan.days.find((d) => d.key === '2026-08-03')?.hasData).toBe(true);
    expect(plan.days.find((d) => d.key === '2026-08-04')?.hasData).toBe(false);
  });

  it('funktioniert über eine Monatsgrenze hinweg', async () => {
    const plan = await buildBulkTypPlan(makeStore(), '2026-08-31', '2026-09-01', 'U');
    expect(plan.days.map((d) => d.key)).toEqual(['2026-08-31', '2026-09-01']);
  });
});

describe('applyBulkTypPlan', () => {
  it('setzt typ+typManuell, behält bestehende Daten bei keepData=true', async () => {
    const store = makeStore({
      '2026-08-03': { ...emptyEntry(2026, 8, 3), start: '08:00', ende: '16:00', beschreibung: 'Wichtig' },
    });
    const saveEntry = vi.fn(async (_key: string, _data: TagesEintrag) => {});
    const plan = await buildBulkTypPlan(store, '2026-08-03', '2026-08-03', 'U');
    const result = await applyBulkTypPlan(store, plan, saveEntry, true);
    expect(result).toEqual({ succeeded: 1, failedKeys: [] });
    const saved = saveEntry.mock.calls[0][1] as TagesEintrag;
    expect(saved.typ).toBe('U');
    expect(saved.typManuell).toBe(true);
    expect(saved.start).toBe('08:00'); // erhalten geblieben
    expect(saved.beschreibung).toBe('Wichtig');
  });

  it('leert Zeiten/Kosten/Belege bei keepData=false, behält aber Beschreibung/Sonstiges', async () => {
    const store = makeStore({
      '2026-08-03': {
        ...emptyEntry(2026, 8, 3), start: '08:00', ende: '16:00', km: '50',
        beschreibung: 'Wichtig', sonstiges: '12', receiptIds: ['r1'],
      },
    });
    const saveEntry = vi.fn(async (_key: string, _data: TagesEintrag) => {});
    const plan = await buildBulkTypPlan(store, '2026-08-03', '2026-08-03', 'U');
    await applyBulkTypPlan(store, plan, saveEntry, false);
    const saved = saveEntry.mock.calls[0][1] as TagesEintrag;
    expect(saved.typ).toBe('U');
    expect(saved.start).toBe('');
    expect(saved.km).toBe('');
    expect(saved.receiptIds).toEqual([]);
    expect(saved.beschreibung).toBe('Wichtig'); // bleibt erhalten
    expect(saved.sonstiges).toBe('12'); // bleibt erhalten
  });

  it('legt für Tage ohne bisherigen Eintrag einen neuen mit dem gewünschten Typ an', async () => {
    const store = makeStore({});
    const saveEntry = vi.fn(async (_key: string, _data: TagesEintrag) => {});
    const plan = await buildBulkTypPlan(store, '2026-08-03', '2026-08-03', 'U');
    await applyBulkTypPlan(store, plan, saveEntry, true);
    expect(saveEntry).toHaveBeenCalledWith('2026-08-03', expect.objectContaining({ typ: 'U', typManuell: true }));
  });

  it('verarbeitet jeden Tag unabhängig - ein Fehlschlag blockiert nicht die restlichen', async () => {
    const store = makeStore({});
    const saveEntry = vi.fn(async (key: string) => {
      if (key === '2026-08-04') throw new Error('boom');
    });
    const plan = await buildBulkTypPlan(store, '2026-08-03', '2026-08-05', 'U');
    const result = await applyBulkTypPlan(store, plan, saveEntry, true);
    expect(result.succeeded).toBe(2);
    expect(result.failedKeys).toEqual(['2026-08-04']);
  });
});
