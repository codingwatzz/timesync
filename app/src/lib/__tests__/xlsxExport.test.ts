import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import type { TagesEintrag } from '../../core/types';
import { entriesToZeilen, buildFilledXlsx } from '../xlsxExport';

function leererEintrag(overrides: Partial<TagesEintrag> = {}): TagesEintrag {
  return {
    typ: 'A', typManuell: false, ho: false,
    start: '', ende: '', pause: '', start2: '', ende2: '', pause2: '',
    beschreibung: '', km: '', transport: '', hotel: '', bewirtung: '', sonstiges: '',
    reiseland: 'Deutschland', reiseart: '', fr: false, mi: false, ab: false,
    receiptIds: [],
    ...overrides,
  };
}

describe('entriesToZeilen', () => {
  it('wählt nur Tage mit Kosten- oder Reiseart-relevanten Daten aus', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-01': leererEintrag({ beschreibung: 'nur Homeoffice, keine Kosten' }),
      '2026-08-02': leererEintrag({ sonstiges: '10' }),
      '2026-08-03': leererEintrag({ reiseart: 'Anreisetag' }),
    };
    const zeilen = entriesToZeilen(2026, 8, entries);
    expect(zeilen.map((z) => z.datum.getDate())).toEqual([2, 3]);
  });

  it("behandelt die interne '<8h'-Markierung als keinen VMA-Anspruch", () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-01': leererEintrag({ sonstiges: '5', reiseart: 'Abwesenheitstag (<8h)' }),
    };
    const [zeile] = entriesToZeilen(2026, 8, entries);
    expect(zeile.reiseart).toBeNull();
  });

  it('berechnet Verpflegungsmehraufwand korrekt (Deutschland, >8h, keine Mahlzeiten)', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-01': leererEintrag({ sonstiges: '5', km: '150', reiseart: 'Abwesenheitstag (>8h)' }),
    };
    const [zeile] = entriesToZeilen(2026, 8, entries);
    expect(zeile.reiseart).toBe('Abwesenheitstag (>8h)');
  });
});

describe('buildFilledXlsx (Struktur-Regressionstest gegen die echte Vorlage)', () => {
  let originalNamelist: string[];
  let originalSheetXml: string;

  beforeAll(async () => {
    const vorlagePath = path.resolve(__dirname, '../../../public/Spesenabrechnung-Vorlage.xltx');
    const data = fs.readFileSync(vorlagePath);
    global.fetch = (async () => ({
      ok: true,
      arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    })) as unknown as typeof fetch;

    const zip = await JSZip.loadAsync(data);
    originalNamelist = Object.keys(zip.files).filter((k) => !zip.files[k].dir).sort();
    originalSheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  });

  it('erzeugt eine strukturell unveränderte Datei (gleiche Dateien, keine Verzeichnis-Einträge)', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-01': leererEintrag({ sonstiges: '63' }),
      '2026-08-14': leererEintrag({ sonstiges: '10', km: '150', reiseart: 'Abwesenheitstag (>8h)' }),
    };
    const { blob } = await buildFilledXlsx(2026, 8, entries);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const neuZip = await JSZip.loadAsync(buf);
    const neuNamelist = Object.keys(neuZip.files).filter((k) => !neuZip.files[k].dir).sort();
    expect(neuNamelist).toEqual(originalNamelist);
    expect(Object.keys(neuZip.files).some((k) => neuZip.files[k].dir)).toBe(false);
  });

  it('lässt unbenutzte Zeilen (18-40) und die T-Spalte unverändert', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-01': leererEintrag({ sonstiges: '63' }),
    };
    const { blob } = await buildFilledXlsx(2026, 8, entries);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const neuZip = await JSZip.loadAsync(buf);
    const neuSheetXml = await neuZip.file('xl/worksheets/sheet1.xml')!.async('string');

    const getCell = (xml: string, ref: string) => {
      const self = new RegExp(`<c r="${ref}"[^>]*/>`).exec(xml);
      if (self) return self[0];
      const full = new RegExp(`<c r="${ref}"[^>]*>[\\s\\S]*?</c>`).exec(xml);
      return full ? full[0] : null;
    };

    for (let row = 18; row <= 40; row++) {
      for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'N', 'O', 'P', 'Q', 'R']) {
        expect(getCell(neuSheetXml, `${col}${row}`)).toBe(getCell(originalSheetXml, `${col}${row}`));
      }
    }
    for (let row = 11; row <= 40; row++) {
      expect(getCell(neuSheetXml, `T${row}`)).toBe(getCell(originalSheetXml, `T${row}`));
    }
  });

  it('setzt Content-Type auf Arbeitsmappe statt Vorlage', async () => {
    const entries: Record<string, TagesEintrag> = { '2026-08-01': leererEintrag({ sonstiges: '5' }) };
    const { blob } = await buildFilledXlsx(2026, 8, entries);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const neuZip = await JSZip.loadAsync(buf);
    const ct = await neuZip.file('[Content_Types].xml')!.async('string');
    expect(ct).toContain('spreadsheetml.sheet.main+xml');
    expect(ct).not.toContain('spreadsheetml.template.main+xml');
  });

  it('wirft bei mehr als 30 relevanten Tagen einen Fehler statt eine falsche Datei zu erzeugen', async () => {
    const entries: Record<string, TagesEintrag> = {};
    for (let d = 1; d <= 31; d++) {
      entries[`2026-08-${String(d).padStart(2, '0')}`] = leererEintrag({ sonstiges: '1' });
    }
    await expect(buildFilledXlsx(2026, 8, entries)).rejects.toThrow();
  });
});
