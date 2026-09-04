import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import type { TagesEintrag } from '../../../core/types';
import { buildArbeitszeitXlsx } from '../arbeitszeitExport';

function eintrag(overrides: Partial<TagesEintrag> = {}): TagesEintrag {
  return {
    typ: 'A', typManuell: true, ho: false,
    start: '', ende: '', pause: '', start2: '', ende2: '', pause2: '',
    beschreibung: '', km: '', transport: '', hotel: '', bewirtung: '', sonstiges: '',
    reiseland: 'Deutschland', reiseart: '', fr: false, mi: false, ab: false,
    receiptIds: [],
    ...overrides,
  };
}

/** Füllt explizit ALLE Tage eines Monats mit 'Wochenende' (zählt nirgends mit) - vermeidet,
 * dass fehlende Tage über den emptyEntry()-Fallback (wie im Rest der App) unbeabsichtigt als
 * Standard-Arbeitstag in die Zählung einfließen. Einzelne Tage werden danach gezielt
 * überschrieben. */
function vollerMonatNeutral(year: number, month: number): Record<string, TagesEintrag> {
  const entries: Record<string, TagesEintrag> = {};
  const n = new Date(year, month, 0).getDate();
  for (let d = 1; d <= n; d++) {
    entries[`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`] = eintrag({ typ: 'W' });
  }
  return entries;
}

async function ladeWorkbook(blob: Blob) {
  const buf = await blob.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.getWorksheet('Arbeitszeiten')!;
}

describe('buildArbeitszeitXlsx', () => {
  it('berechnet IST korrekt aus Start/Ende/Pause', async () => {
    // September 2026: Di 01.09. ist ein Arbeitstag
    const entries: Record<string, TagesEintrag> = {
      '2026-09-01': eintrag({ start: '09:00', ende: '17:00', pause: '30' }),
    };
    const blob = await buildArbeitszeitXlsx(2026, 9, entries);
    const ws = await ladeWorkbook(blob);
    let gefunden = false;
    ws.eachRow((row) => {
      if (row.getCell(1).value === '01.09.2026') {
        expect(row.getCell(11).value).toBe('07:30'); // IST: 8h - 30min
        expect(row.getCell(12).value).toBe('06:24'); // SOLL
        expect(row.getCell(13).value).toBe('01:06'); // EXTRA (kein Vorzeichen bei positiven Werten)
        gefunden = true;
      }
    });
    expect(gefunden).toBe(true);
  });

  it('setzt SOLL nur an echten Arbeitstagen (nicht an Urlaub/Krank/Wochenende)', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-09-02': eintrag({ typ: 'U' }), // Urlaub
    };
    const blob = await buildArbeitszeitXlsx(2026, 9, entries);
    const ws = await ladeWorkbook(blob);
    let gefunden = false;
    ws.eachRow((row) => {
      if (row.getCell(1).value === '02.09.2026') {
        expect(row.getCell(12).value).toBe('00:00');
        gefunden = true;
      }
    });
    expect(gefunden).toBe(true);
  });

  it('berücksichtigt die zweite Schicht in der IST-Berechnung', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-09-01': eintrag({ start: '09:00', ende: '13:00', pause: '', start2: '18:00', ende2: '20:00', pause2: '' }),
    };
    const blob = await buildArbeitszeitXlsx(2026, 9, entries);
    const ws = await ladeWorkbook(blob);
    let gefunden = false;
    ws.eachRow((row) => {
      if (row.getCell(1).value === '01.09.2026') {
        expect(row.getCell(11).value).toBe('06:00'); // 4h + 2h
        gefunden = true;
      }
    });
    expect(gefunden).toBe(true);
  });

  it('zeigt eine negative Abweichung korrekt mit Minuszeichen (nicht das fmtHHMM-Vorzeichenproblem)', async () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-09-01': eintrag({ start: '09:00', ende: '12:00', pause: '' }), // nur 3h IST, SOLL 6:24
    };
    const blob = await buildArbeitszeitXlsx(2026, 9, entries);
    const ws = await ladeWorkbook(blob);
    let gefunden = false;
    ws.eachRow((row) => {
      if (row.getCell(1).value === '01.09.2026') {
        expect(row.getCell(13).value).toBe('-03:24');
        gefunden = true;
      }
    });
    expect(gefunden).toBe(true);
  });

  it('zählt Arbeitstage/Urlaubstage/Krankheitstage/Gleitfreitage korrekt in der Zusammenfassung', async () => {
    const entries = vollerMonatNeutral(2026, 9);
    entries['2026-09-01'] = eintrag({ typ: 'A' });
    entries['2026-09-02'] = eintrag({ typ: 'A' });
    entries['2026-09-03'] = eintrag({ typ: 'U' });
    entries['2026-09-04'] = eintrag({ typ: 'K' });
    entries['2026-09-07'] = eintrag({ typ: 'G' });
    const blob = await buildArbeitszeitXlsx(2026, 9, entries);
    const ws = await ladeWorkbook(blob);
    const werte: Record<string, unknown> = {};
    ws.eachRow((row) => {
      const label = row.getCell(1).value;
      if (typeof label === 'string' && ['Arbeitstage', 'Urlaubstage', 'Krankheitstage', 'Gleitfreitage'].includes(label)) {
        werte[label] = row.getCell(3).value;
      }
    });
    expect(werte.Arbeitstage).toBe(2);
    expect(werte.Urlaubstage).toBe(1);
    expect(werte.Krankheitstage).toBe(1);
    expect(werte.Gleitfreitage).toBe(1);
  });

  it('berechnet die Homeoffice-Quote nur über Arbeitstage', async () => {
    const entries = vollerMonatNeutral(2026, 9);
    entries['2026-09-01'] = eintrag({ typ: 'A', ho: true });
    entries['2026-09-02'] = eintrag({ typ: 'A', ho: false });
    entries['2026-09-03'] = eintrag({ typ: 'A', ho: true });
    entries['2026-09-04'] = eintrag({ typ: 'A', ho: true });
    const blob = await buildArbeitszeitXlsx(2026, 9, entries);
    const ws = await ladeWorkbook(blob);
    let quote: unknown = null;
    let detail: unknown = null;
    ws.eachRow((row) => {
      if (row.getCell(1).value === 'Homeoffice-Quote:') {
        quote = row.getCell(2).value;
        detail = row.getCell(3).value;
      }
    });
    expect(quote).toBeCloseTo(0.75);
    expect(detail).toContain('3 von 4');
  });

  it('berechnet Gesamt-EXTRA in Prozent relativ zum Gesamt-SOLL (GESAMT-Zeile)', async () => {
    // Zwei Arbeitstage: SOLL = 2*6:24 = 12:48 = 768min. IST = 2*7:00 = 14:00 = 840min.
    // EXTRA = 72min. Prozent = 72/768*100 = 9.375% -> "(+9.4 %)"
    const entries = vollerMonatNeutral(2026, 9);
    entries['2026-09-01'] = eintrag({ typ: 'A', start: '09:00', ende: '16:00', pause: '' });
    entries['2026-09-02'] = eintrag({ typ: 'A', start: '09:00', ende: '16:00', pause: '' });
    const blob = await buildArbeitszeitXlsx(2026, 9, entries);
    const ws = await ladeWorkbook(blob);
    let prozentZeile: unknown = null;
    ws.eachRow((row) => {
      if (row.getCell(1).value === 'GESAMT:') prozentZeile = row.getCell(14).value;
    });
    expect(prozentZeile).toBe('(+9.4 %)');
  });

  it('blendet Wochenendtage ohne Arbeitszeit aus, zeigt sie aber wenn Arbeitszeit dokumentiert wurde', async () => {
    const entries = vollerMonatNeutral(2026, 9); // alle Tage 'W', Sept 2026 hat am 5./6. ein Wochenende
    entries['2026-09-06'] = eintrag({ typ: 'W', start: '10:00', ende: '12:00', pause: '' }); // Sonntag gearbeitet
    const blob = await buildArbeitszeitXlsx(2026, 9, entries);
    const ws = await ladeWorkbook(blob);
    const daten: string[] = [];
    ws.eachRow((row) => {
      const v = row.getCell(1).value;
      if (typeof v === 'string' && v.includes('.09.2026')) daten.push(v);
    });
    expect(daten).not.toContain('05.09.2026'); // Samstag, keine Arbeitszeit -> ausgeblendet
    expect(daten).toContain('06.09.2026'); // Sonntag, Arbeitszeit dokumentiert -> gezeigt
  });
});
