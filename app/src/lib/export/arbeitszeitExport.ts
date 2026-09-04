// Erzeugt eine Arbeitszeiten-Übersicht als .xlsx - rein zur eigenen Kontrolle (kein
// Formular einer dritten Stelle wie bei der Spesenabrechnung), daher hier ExcelJS statt
// chirurgischem XML-Patching: einfacher zu warten, Formatierung/Farben direkt über die API
// statt über rohe styles.xml-Strings.

import ExcelJS from 'exceljs';
import type { TagesEintrag, Wochentyp } from '../../core/types';
import { dateKey } from '../../core/holidays';
import { emptyEntry } from '../../core/entry';
import { arbeitszeitMinuten } from '../../core/entry';
import { daysInMonth, fmtHHMM, fmtHHMMSigned, pad } from '../../core/formatters';
import { WOCHENTAGE, TYP_LABEL, MONATSNAMEN } from '../../core/constants';

// 6:24h - vom Nutzer vorgegeben, gilt nur an echten Arbeitstagen (Typ 'A'). Wochenende,
// Feiertag, Urlaub, Krank und Gleitfrei fließen NICHT ins SOLL ein (Nutzerentscheidung
// 04.09.2026: "Nur echte Arbeitstage").
const SOLL_MINUTEN_PRO_ARBEITSTAG = 6 * 60 + 24;

// Farben fuer Tages-Zeilen: nur Text eingefaerbt (keine Fuellung) - dezent, damit die
// Tabelle bei vielen Tagen nicht zu "bunt" wirkt.
const TAGES_ROT = 'FFC00000';
const TAGES_GRUEN = 'FF006100';
// Farben fuer Wochen-/Gesamtsumme: Text + Fuellung, exakt Excels eigene "Gut"/"Schlecht"-
// Bedingte-Formatierungs-Farben (vom Nutzer am 04.09.2026 so in der bearbeiteten Datei
// vorgegeben) - heben die wichtigen Summenzeilen staerker hervor als einzelne Tage.
const SUMME_GRUEN_TEXT = 'FF006100';
const SUMME_GRUEN_FUELLUNG = 'FFC6EFCE';
const SUMME_ROT_TEXT = 'FF9C0006';
const SUMME_ROT_FUELLUNG = 'FFFFC7CE';
const BLAU = 'FF1F6FB2';

interface TagesZeile {
  datum: Date;
  typ: Wochentyp;
  ho: boolean;
  start: string; ende: string; pause: string;
  start2: string; ende2: string; pause2: string;
  ist: number; // Minuten
  soll: number; // Minuten
}

function baueTagesZeilen(year: number, month: number, entries: Record<string, TagesEintrag>): TagesZeile[] {
  const n = daysInMonth(year, month);
  const zeilen: TagesZeile[] = [];
  for (let d = 1; d <= n; d++) {
    const e = entries[dateKey(year, month, d)] ?? emptyEntry(year, month, d);
    const ist = arbeitszeitMinuten(e);
    const soll = e.typ === 'A' ? SOLL_MINUTEN_PRO_ARBEITSTAG : 0;
    zeilen.push({
      datum: new Date(year, month - 1, d), typ: e.typ, ho: e.ho,
      start: e.start, ende: e.ende, pause: e.pause,
      start2: e.start2, ende2: e.ende2, pause2: e.pause2,
      ist, soll,
    });
  }
  return zeilen;
}

/** Montag der Kalenderwoche, die `datum` enthält - Gruppierungsschlüssel für die
 * Wochen-Zwischensummen. */
function montagDerWoche(datum: Date): string {
  const wochentagIso = (datum.getDay() + 6) % 7; // Mo=0 ... So=6
  const montag = new Date(datum);
  montag.setDate(datum.getDate() - wochentagIso);
  return `${montag.getFullYear()}-${pad(montag.getMonth() + 1)}-${pad(montag.getDate())}`;
}

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
  const zeilen = baueTagesZeilen(year, month, entries);

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
  let wochenAkkumulator = { ist: 0, soll: 0 };
  let aktuelleWoche = zeilen.length > 0 ? montagDerWoche(zeilen[0].datum) : null;

  const gesamtProTyp: Record<Wochentyp, number> = { A: 0, W: 0, F: 0, U: 0, K: 0, G: 0 };
  let arbeitstageGesamt = 0;
  let homeofficeTage = 0;
  let gesamtIst = 0;
  let gesamtSoll = 0;

  function schreibeWochenZwischensumme() {
    const row = ws.getRow(rowIdx++);
    row.getCell(1).value = 'Wochensumme';
    row.getCell(11).value = fmtHHMM(wochenAkkumulator.ist);
    row.getCell(12).value = fmtHHMM(wochenAkkumulator.soll);
    const extra = wochenAkkumulator.ist - wochenAkkumulator.soll;
    row.getCell(13).value = fmtHHMMSigned(extra);
    [1, 11, 12].forEach((c) => { row.getCell(c).font = { bold: true, size: 14 }; });
    faerbeAbweichungSumme(row.getCell(13), extra);
    wochenAkkumulator = { ist: 0, soll: 0 };
  }

  for (const z of zeilen) {
    const woche = montagDerWoche(z.datum);
    const wocheHatteInhalt = wochenAkkumulator.ist !== 0 || wochenAkkumulator.soll !== 0;
    if (aktuelleWoche !== null && woche !== aktuelleWoche) {
      if (wocheHatteInhalt) {
        schreibeWochenZwischensumme();
        rowIdx++; // Leerzeile zwischen den Wochen fuer bessere Uebersicht
      } else {
        wochenAkkumulator = { ist: 0, soll: 0 };
      }
    }
    aktuelleWoche = woche;

    const extra = z.ist - z.soll;
    // Wochenendtage ohne dokumentierte Arbeitszeit werden nicht als eigene Zeile gezeigt
    // (Nutzerwunsch 04.09.2026) - zaehlen aber weiterhin korrekt in Wochen-/Gesamtsummen mit,
    // da diese Berechnungen unten unveraendert fuer JEDEN Tag laufen, nicht nur fuer
    // angezeigte Zeilen.
    const zeileAnzeigen = z.typ !== 'W' || z.ist > 0;
    if (zeileAnzeigen) {
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
      row.getCell(13).value = fmtHHMMSigned(extra);
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= 13) cell.border = DUENNER_RAHMEN;
      });
      if (z.typ === 'W' || z.typ === 'F') {
        row.eachCell((cell) => { cell.font = { color: { argb: 'FF9A9A9A' } }; });
      }
      faerbeAbweichungTag(row.getCell(13), extra);
    }

    wochenAkkumulator.ist += z.ist;
    wochenAkkumulator.soll += z.soll;
    gesamtProTyp[z.typ]++;
    if (z.typ === 'A') {
      arbeitstageGesamt++;
      if (z.ho) homeofficeTage++;
    }
    gesamtIst += z.ist;
    gesamtSoll += z.soll;
  }
  if (wochenAkkumulator.ist !== 0 || wochenAkkumulator.soll !== 0) {
    schreibeWochenZwischensumme();
  }

  rowIdx += 1;
  const gesamtExtra = gesamtIst - gesamtSoll;
  const gesamtProzent = gesamtSoll > 0 ? (gesamtExtra / gesamtSoll) * 100 : 0;

  const gesamtRow = ws.getRow(rowIdx++);
  gesamtRow.getCell(1).value = 'GESAMT:';
  gesamtRow.getCell(1).font = { bold: true };
  gesamtRow.getCell(11).value = fmtHHMM(gesamtIst);
  gesamtRow.getCell(11).font = { bold: true };
  gesamtRow.getCell(12).value = fmtHHMM(gesamtSoll);
  gesamtRow.getCell(12).font = { bold: true };
  gesamtRow.getCell(13).value = fmtHHMMSigned(gesamtExtra);
  gesamtRow.getCell(14).value = `(${gesamtProzent >= 0 ? '+' : ''}${gesamtProzent.toFixed(1)} %)`;
  faerbeAbweichungSumme(gesamtRow.getCell(13), gesamtExtra);
  faerbeAbweichungSumme(gesamtRow.getCell(14), gesamtExtra);

  rowIdx += 2;
  const hoRow = ws.getRow(rowIdx++);
  hoRow.getCell(1).value = 'Homeoffice-Quote:';
  hoRow.getCell(2).value = arbeitstageGesamt > 0 ? homeofficeTage / arbeitstageGesamt : 0;
  hoRow.getCell(2).numFmt = '0%';
  hoRow.getCell(3).value = arbeitstageGesamt > 0 ? `(${homeofficeTage} von ${arbeitstageGesamt} Arbeitstagen)` : '(keine Arbeitstage)';

  rowIdx++;
  function schreibeAnzahl(label: string, wert: number) {
    const row = ws.getRow(rowIdx++);
    row.getCell(1).value = label;
    row.getCell(3).value = wert;
  }
  schreibeAnzahl('Arbeitstage', gesamtProTyp.A);
  schreibeAnzahl('Urlaubstage', gesamtProTyp.U);
  schreibeAnzahl('Krankheitstage', gesamtProTyp.K);
  schreibeAnzahl('Gleitfreitage', gesamtProTyp.G);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
