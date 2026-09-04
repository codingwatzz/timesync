import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { TagesEintrag } from '../../../core/types';
import type { KVStore } from '../../../store/types';
import { buildMergedReceiptsPdf } from '../receiptMerge';
import { leererEintrag } from './testFixtures';

async function testPdfDataUrl(beschriftung: string): Promise<string> {
  const doc = await PDFDocument.create();
  const seite = doc.addPage([200, 200]);
  seite.drawText(beschriftung, { x: 20, y: 100 });
  const bytes = await doc.save();
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:application/pdf;base64,${btoa(binary)}`;
}

function mockStore(belege: Record<string, string>): KVStore {
  return {
    async get(key: string) {
      const rid = key.replace('receipt:', '');
      if (!(rid in belege)) return null;
      return { key, value: JSON.stringify({ id: rid, name: `${rid}.pdf`, mime: 'application/pdf', createdAt: 0, date: '2026-08-01', dataUrl: belege[rid] }) };
    },
    async set() { /* nicht gebraucht */ },
    async delete() { /* nicht gebraucht */ },
  } as unknown as KVStore;
}

describe('buildMergedReceiptsPdf', () => {
  it('fügt Belege in Datumsreihenfolge zusammen', async () => {
    const belege = {
      r1: await testPdfDataUrl('Beleg vom 14.'),
      r2: await testPdfDataUrl('Beleg vom 04.'),
    };
    const entries: Record<string, TagesEintrag> = {
      '2026-08-14': leererEintrag({ sonstiges: '10', receiptIds: ['r1'] }),
      '2026-08-04': leererEintrag({ sonstiges: '5', receiptIds: ['r2'] }),
    };
    const { blob, bericht } = await buildMergedReceiptsPdf(mockStore(belege), 2026, 8, entries);
    expect(bericht.eingebundeneBelege.map((b) => b.date)).toEqual(['2026-08-04', '2026-08-14']);
    expect(bericht.fehlendeBelege).toEqual([]);
    const merged = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(merged.getPageCount()).toBe(2);
  });

  it('meldet Tage ohne Beleg, obwohl Kosten eingetragen sind', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-01': leererEintrag({ sonstiges: '10', receiptIds: [] }),
    };
    const { bericht } = await buildMergedReceiptsPdf(mockStore({}), 2026, 8, entries);
    expect(bericht.tageOhneBeleg).toEqual(['2026-08-01']);
  });

  it('meldet fehlende Belege (referenziert, aber nicht ladbar) statt sie stillschweigend zu überspringen', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-01': leererEintrag({ sonstiges: '10', receiptIds: ['nicht-vorhanden'] }),
    };
    const { bericht } = await buildMergedReceiptsPdf(mockStore({}), 2026, 8, entries);
    expect(bericht.fehlendeBelege).toEqual([{ date: '2026-08-01', rid: 'nicht-vorhanden' }]);
  });

  it('ignoriert Tage ohne Kosten-/Reiseart-Relevanz (wie beim xlsx-Export)', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-01': leererEintrag({ beschreibung: 'nur Homeoffice' }),
    };
    const { bericht } = await buildMergedReceiptsPdf(mockStore({}), 2026, 8, entries);
    expect(bericht.tageOhneBeleg).toEqual([]);
    expect(bericht.eingebundeneBelege).toEqual([]);
  });
});
