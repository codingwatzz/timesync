import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import type { TagesEintrag } from '../../../core/types';
import type { KVStore } from '../../../store/types';
import { buildExportZip } from '../zipExport';
import { leererEintrag as eintrag } from './testFixtures';

function mockStore(): KVStore {
  return {
    async get() { return null; },
    async set() { /* nicht gebraucht */ },
    async delete() { /* nicht gebraucht */ },
  } as unknown as KVStore;
}

describe('buildExportZip', () => {
  beforeAll(() => {
    const vorlagePath = path.resolve(__dirname, '../../../../public/Spesenabrechnung-Vorlage.xltx');
    const data = fs.readFileSync(vorlagePath);
    global.fetch = (async () => ({
      ok: true,
      arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    })) as unknown as typeof fetch;
  });

  it('packt alle drei Dateien mit den erwarteten Namen in ein .zip', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-04': eintrag({ sonstiges: '10', receiptIds: ['nicht-vorhanden'] }),
    };
    const { blob, belegeBericht } = await buildExportZip(2026, 8, entries, mockStore());

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const namen = Object.keys(zip.files).sort();
    expect(namen).toEqual([
      '2026-08_Arbeitszeiten-Raoul.xlsx',
      '2026-08_Belege-Spesenabrechnung-Raoul.pdf',
      '2026-08_Spesenabrechnung-Raoul.xlsx',
    ]);
    // receiptId referenziert, aber mockStore liefert immer null -> erwartungsgemäß als
    // fehlend gemeldet, nicht stillschweigend übersprungen.
    expect(belegeBericht.fehlendeBelege.length).toBe(1);
  });

  it('jede Datei im Zip hat plausiblen Inhalt (nicht leer, richtiger Dateityp)', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-04': eintrag({ sonstiges: '10' }),
    };
    const { blob } = await buildExportZip(2026, 8, entries, mockStore());
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    const xlsxBytes = await zip.file('2026-08_Spesenabrechnung-Raoul.xlsx')!.async('uint8array');
    expect(xlsxBytes.length).toBeGreaterThan(1000);
    // xlsx/pdf/zip-Signaturen pruefen (erste Bytes) statt nur auf Groesse zu vertrauen
    expect(xlsxBytes[0]).toBe(0x50); // 'P' - ZIP-Signatur (xlsx ist selbst ein Zip)
    expect(xlsxBytes[1]).toBe(0x4b); // 'K'

    const pdfBytes = await zip.file('2026-08_Belege-Spesenabrechnung-Raoul.pdf')!.async('uint8array');
    expect(String.fromCharCode(...pdfBytes.slice(0, 4))).toBe('%PDF');

    const arbeitszeitBytes = await zip.file('2026-08_Arbeitszeiten-Raoul.xlsx')!.async('uint8array');
    expect(arbeitszeitBytes[0]).toBe(0x50);
    expect(arbeitszeitBytes[1]).toBe(0x4b);
  });
});
