// Erzeugt eine Arbeitszeiten-Übersicht als .xlsx - rein zur eigenen Kontrolle (kein
// Formular einer dritten Stelle wie bei der Spesenabrechnung), daher hier ExcelJS statt
// chirurgischem XML-Patching: einfacher zu warten, Formatierung/Farben direkt über die API
// statt über rohe styles.xml-Strings.
//
// Die eigentliche Berechnung (Wochensummen, Gesamtsummen, IST/SOLL/EXTRA) lebt seit
// 04.09.2026 in core/arbeitszeit.ts - hier wird nur noch aus deren Ergebnis eine Excel-Datei
// geschrieben. Grund: die neue In-App-Vorschau (ArbeitszeitPreview.tsx) braucht exakt dieselbe
// Berechnung, ohne ExcelJS mitzuschleppen - eine zweite, separate Implementierung hätte real
// auseinanderlaufen können.

import ExcelJS from 'exceljs';
import type { TagesEintrag } from '../../core/types';
import { berechneArbeitszeit } from '../../core/arbeitszeit';
import { fmtHHMM, fmtHHMMSigned, pad } from '../../core/formatters';
import { WOCHENTAGE, TYP_LABEL, MONATSNAMEN } from '../../core/constants';

const TAGES_ROT = 'FFC00000';
const TAGES_GRUEN = 'FF006100';
const SUMME_GRUEN_TEXT = 'FF006100';
const SUMME_GRUEN_FUELLUNG = 'FFC6EFCE';
const SUMME_ROT_TEXT = 'FF9C0006';
const SUMME_ROT_FUELLUNG = 'FFFFC7CE';
const BLAU = 'FF1F6FB2';

const DUENNER_RAHMEN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
};

/** Für einzelne Tages-Zeilen: nur Textfarbe, keine Füllung (dezent). */
function faerbeAbweichungTag(cell: ExcelJS.Cell, minuten: number): void {
  if (minuten > 0) cell.font = { color: { argb: TAGES_GRUEN }, bold: true };
  else if (minuten < 0) cell.font = { color: { argb: TAGES_ROT }, bold: true };
}

/** Für Wochen-/Gesamtsummen: Text + Füllung, Excels eigene "Gut"/"Schlecht"-Farben. */
function faerbeAbweichungSumme(cell: ExcelJS.Cell, minuten: number): void {
  if (minuten > 0) {
    cell.font = { color: { argb: SUMME_GRUEN_TEXT }, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUMME_GRUEN_FUELLUNG } };
  } else if (minuten < 0) {
    cell.font = { color: { argb: SUMME_ROT_TEXT }, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUMME_ROT_FUELLUNG } };
  }
}

export async function buildArbeitszeitXlsx(year: number, month: number, entries: Record<string, TagesEintrag>): Promise<Blob> {
  const b = berechneArbeitszeit(year, month, entries);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Arbeitszeiten', { views: [{ state: 'frozen', ySplit: 4 }] });

  ws.mergeCells('A1:N1');
  ws.getCell('A1').value = `Arbeitszeiten ${MONATSNAMEN[month - 1]} ${year}`;
  ws.getCell('A1').font = { size: 16, bold: true };
  ws.getRow(1).height = 24;

  const kopf = ['Datum', 'Wochentag', 'Typ', 'HO', 'Start', 'Ende', 'Pause', 'Start (2)', 'Ende (2)', 'Pause (2)', 'IST', 'SOLL', 'EXTRA'];
  const headerRow = ws.getRow(3);
  headerRow.values = kopf;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLAU } };
    cell.alignment = { horizontal: 'left' };
    cell.border = DUENNER_RAHMEN;
  });
  ws.columns = [
    { width: 20 }, { width: 10 }, { width: 24 }, { width: 5 },
    { width: 8 }, { width: 8 }, { width: 8 },
    { width: 9 }, { width: 9 }, { width: 9 },
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 10 },
  ];

  let rowIdx = 5; // Zeile 4 bleibt bewusst leer (Abstand zwischen Kopfzeile und erstem Tag)
  for (const z of b.zeilen) {
    if (z.art === 'leerzeile') {
      rowIdx++;
      continue;
    }
    if (z.art === 'wochensumme') {
      const row = ws.getRow(rowIdx++);
      row.getCell(1).value = 'Wochensumme';
      row.getCell(11).value = fmtHHMM(z.ist);
      row.getCell(12).value = fmtHHMM(z.soll);
      row.getCell(13).value = fmtHHMMSigned(z.extra);
      [1, 11, 12].forEach((c) => { row.getCell(c).font = { bold: true, size: 14 }; });
      faerbeAbweichungSumme(row.getCell(13), z.extra);
      continue;
    }
    // z.art === 'tag'
    const row = ws.getRow(rowIdx++);
    row.getCell(1).value = `${pad(z.datum.getDate())}.${pad(z.datum.getMonth() + 1)}.${z.datum.getFullYear()}`;
    row.getCell(2).value = WOCHENTAGE[z.datum.getDay()];
    row.getCell(3).value = TYP_LABEL[z.typ];
    row.getCell(4).value = z.typ === 'A' ? (z.ho ? 'Ja' : 'Nein') : '';
    row.getCell(5).value = z.start;
    row.getCell(6).value = z.ende;
    row.getCell(7).value = z.pause ? Number(z.pause) : '';
    row.getCell(8).value = z.start2;
    row.getCell(9).value = z.ende2;
    row.getCell(10).value = z.pause2 ? Number(z.pause2) : '';
    row.getCell(11).value = fmtHHMM(z.ist);
    row.getCell(12).value = fmtHHMM(z.soll);
    row.getCell(13).value = fmtHHMMSigned(z.extra);
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber <= 13) cell.border = DUENNER_RAHMEN;
    });
    if (z.typ === 'W' || z.typ === 'F') {
      row.eachCell((cell) => { cell.font = { color: { argb: 'FF9A9A9A' } }; });
    }
    faerbeAbweichungTag(row.getCell(13), z.extra);
  }

  rowIdx += 1;
  const gesamtRow = ws.getRow(rowIdx++);
  gesamtRow.getCell(1).value = 'GESAMT:';
  gesamtRow.getCell(1).font = { bold: true };
  gesamtRow.getCell(11).value = fmtHHMM(b.gesamtIst);
  gesamtRow.getCell(11).font = { bold: true };
  gesamtRow.getCell(12).value = fmtHHMM(b.gesamtSoll);
  gesamtRow.getCell(12).font = { bold: true };
  gesamtRow.getCell(13).value = fmtHHMMSigned(b.gesamtExtra);
  gesamtRow.getCell(14).value = `(${b.gesamtProzent >= 0 ? '+' : ''}${b.gesamtProzent.toFixed(1)} %)`;
  faerbeAbweichungSumme(gesamtRow.getCell(13), b.gesamtExtra);
  faerbeAbweichungSumme(gesamtRow.getCell(14), b.gesamtExtra);

  rowIdx += 2;
  const hoRow = ws.getRow(rowIdx++);
  hoRow.getCell(1).value = 'Homeoffice-Quote:';
  hoRow.getCell(2).value = b.homeofficeQuote;
  hoRow.getCell(2).numFmt = '0%';
  hoRow.getCell(3).value = b.arbeitstageGesamt > 0 ? `(${b.homeofficeTage} von ${b.arbeitstageGesamt} Arbeitstagen)` : '(keine Arbeitstage)';

  rowIdx++;
  function schreibeAnzahl(label: string, wert: number) {
    const row = ws.getRow(rowIdx++);
    row.getCell(1).value = label;
    row.getCell(3).value = wert;
  }
  schreibeAnzahl('Arbeitstage', b.gesamtProTyp.A);
  schreibeAnzahl('Urlaubstage', b.gesamtProTyp.U);
  schreibeAnzahl('Krankheitstage', b.gesamtProTyp.K);
  schreibeAnzahl('Gleitfreitage', b.gesamtProTyp.G);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
