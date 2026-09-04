// Befüllt die Spesenabrechnungs-Vorlage (.xltx) direkt im Browser mit den Monatsdaten -
// chirurgisches XML-Patching (wie tools/spesenabrechnung/export_xlsx.py auf der Python-
// Seite), damit Dropdown-Validierungen, Formeln und Formatierung der Vorlage unversehrt
// bleiben. Ergebnis ist eine ECHTE .xlsx-Datei, die der Nutzer in seiner eigenen
// Tabellenkalkulation (Excel, Google Sheets, ...) öffnet - dort wird sie garantiert korrekt
// dargestellt, da eine echte Tabellenkalkulation rendert statt eines Rendering-Umwegs.
//
// WICHTIG: JSZip erzeugt beim Überschreiben vorhandener Dateien automatisch zusätzliche
// Verzeichnis-Einträge im Ziel-Zip (reproduzierbar getestet 03.09.2026) - genau die Art
// von strukturellem Unterschied zum Original, die Excel schon einmal komplett zum
// Verweigern des Öffnens gebracht hat (siehe PROJEKT_UEBERSICHT.md, Python-Pendant dieses
// Moduls). Deshalb werden solche Verzeichnis-Einträge hier IMMER explizit vor dem
// Zusammenbauen entfernt (siehe `baueXlsxZip`).

import JSZip from 'jszip';
import type { TagesEintrag } from '../../core/types';
import { type ExportZeile, entriesToZeilen, kmPauschale, vma, summe } from './exportZeilen';
import { SPESEN_NAME_VOLL } from '../../core/constants';

export type { ExportZeile } from './exportZeilen';
export { entriesToZeilen } from './exportZeilen';

const ERSTE_DATENZEILE = 11;
const MAX_DATENZEILEN = 30; // Zeilen 11-40 der Vorlage
const VORLAGE_URL = `${import.meta.env.BASE_URL}Spesenabrechnung-Vorlage.xltx`;

function excelSerial(d: Date): number {
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - epoch) / 86400000);
}

// --- XML-Zellmanipulation - begrenzt IMMER an "</c>" bzw. eigenem "/>", NIE an "</f>"
// (manche Formelzellen sind selbstschließend "<f t=\"shared\" .../>" ohne eigenes "</f>" -
// eine an "</f>" begrenzte Suche würde quer durch die Datei laufen). 1:1 aus export_xlsx.py
// übernommen. ---

function findeZelle(xml: string, ref: string): { start: number; end: number; attrs: string; inner: string | null; selfClosing: boolean } {
  const selfClosingMatch = new RegExp(`<c r="${ref}"([^>]*?)/>`).exec(xml);
  if (selfClosingMatch) {
    return { start: selfClosingMatch.index, end: selfClosingMatch.index + selfClosingMatch[0].length, attrs: selfClosingMatch[1], inner: null, selfClosing: true };
  }
  const match = new RegExp(`<c r="${ref}"([^>]*)>([\\s\\S]*?)</c>`).exec(xml);
  if (!match) throw new Error(`Zelle ${ref} nicht in der Vorlage gefunden`);
  return { start: match.index, end: match.index + match[0].length, attrs: match[1], inner: match[2], selfClosing: false };
}

function styleAttr(attrs: string): string {
  const m = /s="(\d+)"/.exec(attrs);
  return m ? ` s="${m[1]}"` : '';
}

function xmlSetNumber(xml: string, ref: string, value: number): string {
  const z = findeZelle(xml, ref);
  const neu = `<c r="${ref}"${styleAttr(z.attrs)}><v>${value}</v></c>`;
  return xml.slice(0, z.start) + neu + xml.slice(z.end);
}

function xmlEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xmlSetInlineString(xml: string, ref: string, text: string): string {
  const z = findeZelle(xml, ref);
  const neu = `<c r="${ref}"${styleAttr(z.attrs)} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
  return xml.slice(0, z.start) + neu + xml.slice(z.end);
}

function xmlSetBlank(xml: string, ref: string): string {
  const z = findeZelle(xml, ref);
  const neu = `<c r="${ref}"${styleAttr(z.attrs)}/>`;
  return xml.slice(0, z.start) + neu + xml.slice(z.end);
}

/** Ändert NUR den <v>-Cache-Wert einer Formelzelle, lässt <f> (egal ob selbstschließend
 * oder nicht) unangetastet. */
function xmlSetCachedFormulaValue(xml: string, ref: string, value: number): string {
  const z = findeZelle(xml, ref);
  if (z.selfClosing || z.inner === null) throw new Error(`${ref} ist eine leere Zelle ohne Formel`);
  if (!z.inner.includes('<f')) throw new Error(`${ref} enthält keine Formel: ${z.inner.slice(0, 80)}`);
  let neuesInner: string;
  if (/<v>[^<]*<\/v>/.test(z.inner)) {
    neuesInner = z.inner.replace(/<v>[^<]*<\/v>/, `<v>${value}</v>`);
  } else {
    neuesInner = z.inner + `<v>${value}</v>`;
  }
  const neu = `<c r="${ref}"${z.attrs}>${neuesInner}</c>`;
  return xml.slice(0, z.start) + neu + xml.slice(z.end);
}

function patchSheetXml(sheetXml: string, name: string, jahr: number, monat: number, zeilen: ExportZeile[]): string {
  if (zeilen.length > MAX_DATENZEILEN) {
    throw new Error(`${zeilen.length} Export-Zeilen, aber die Vorlage hat nur Platz für ${MAX_DATENZEILEN} (Zeilen 11-40).`);
  }
  let xml = xmlSetInlineString(sheetXml, 'C5', name);
  const von = new Date(jahr, monat - 1, 1);
  const bis = new Date(jahr, monat, 0);
  xml = xmlSetNumber(xml, 'H5', excelSerial(von));
  xml = xmlSetNumber(xml, 'H6', excelSerial(bis));

  const gesamt = { D: 0, E: 0, F: 0, H: 0, I: 0, J: 0, K: 0 };
  zeilen.forEach((z, i) => {
    const row = ERSTE_DATENZEILE + i;
    xml = xmlSetNumber(xml, `B${row}`, excelSerial(z.datum));
    xml = xmlSetInlineString(xml, `C${row}`, z.beschreibung);
    xml = xmlSetNumber(xml, `D${row}`, z.hotel);
    xml = xmlSetNumber(xml, `E${row}`, z.transport);
    xml = xmlSetNumber(xml, `F${row}`, z.bewirtung);
    if (z.km !== null) xml = xmlSetNumber(xml, `G${row}`, z.km);
    else xml = xmlSetBlank(xml, `G${row}`);
    xml = xmlSetNumber(xml, `J${row}`, z.sonstiges);
    xml = xmlSetInlineString(xml, `N${row}`, z.reiseland);
    if (z.reiseart !== null) {
      xml = xmlSetInlineString(xml, `O${row}`, z.reiseart);
      xml = xmlSetInlineString(xml, `P${row}`, z.fr ? 'Ja' : 'Nein');
      xml = xmlSetInlineString(xml, `Q${row}`, z.mi ? 'Ja' : 'Nein');
      xml = xmlSetInlineString(xml, `R${row}`, z.ab ? 'Ja' : 'Nein');
    } else {
      for (const col of ['O', 'P', 'Q', 'R']) xml = xmlSetBlank(xml, `${col}${row}`);
    }
    const hPauschale = kmPauschale(z);
    const iVma = vma(z);
    const kSumme = summe(z);
    xml = xmlSetCachedFormulaValue(xml, `H${row}`, hPauschale);
    xml = xmlSetCachedFormulaValue(xml, `I${row}`, iVma);
    xml = xmlSetCachedFormulaValue(xml, `K${row}`, kSumme);
    gesamt.D += z.hotel; gesamt.E += z.transport; gesamt.F += z.bewirtung;
    gesamt.H += hPauschale; gesamt.I += iVma; gesamt.J += z.sonstiges; gesamt.K += kSumme;
  });

  for (const [col, wert] of Object.entries(gesamt)) {
    xml = xmlSetCachedFormulaValue(xml, `${col}41`, wert);
  }
  return xml;
}

function patchWorkbookXml(workbookXml: string): string {
  const neu = workbookXml.replace(/<calcPr calcId="(\d+)"\/>/, '<calcPr calcId="$1" fullCalcOnLoad="1"/>');
  if (neu === workbookXml) throw new Error('calcPr-Element nicht wie erwartet gefunden - Vorlage geändert?');
  return neu;
}

function fixContentType(contentTypesXml: string): string {
  const alt = 'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml';
  const neu = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
  if (!contentTypesXml.includes(alt)) throw new Error('Erwarteter Template-Content-Type nicht gefunden - Vorlage geändert?');
  return contentTypesXml.replace(alt, neu);
}

/** Baut das finale Zip in EXAKT der Original-Dateireihenfolge, ohne Verzeichnis-Einträge -
 * siehe Modul-Kommentar oben. */
async function baueXlsxZip(zip: JSZip, originalOrder: string[]): Promise<Blob> {
  // JSZip erzeugt beim Überschreiben (`zip.file(pfad, inhalt)`) automatisch zusätzliche
  // Verzeichnis-Einträge (reproduzierbar getestet) - diese werden hier vor dem
  // Zusammenbauen explizit entfernt, unabhängig davon, wodurch genau sie entstanden sind.
  Object.keys(zip.files).forEach((pfad) => {
    if (zip.files[pfad].dir) zip.remove(pfad);
  });
  const neueZip = new JSZip();
  for (const name of originalOrder) {
    const datei = zip.file(name);
    if (!datei) throw new Error(`Datei ${name} fehlt beim Zusammenbauen - unerwartet`);
    const inhalt = await datei.async('uint8array');
    neueZip.file(name, inhalt, { createFolders: false });
  }
  return neueZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Lädt die Vorlage, befüllt sie mit den Monatsdaten und gibt die fertige .xlsx als Blob
 * zurück - bereit zum Download. Wirft einen Fehler, falls irgendetwas nicht passt (keine
 * stillschweigend fehlerhafte Datei). */
export async function buildFilledXlsx(
  year: number, month: number, entries: Record<string, TagesEintrag>,
): Promise<{ blob: Blob; zeilen: ExportZeile[] }> {
  const zeilen = entriesToZeilen(year, month, entries);

  const resp = await fetch(VORLAGE_URL);
  if (!resp.ok) throw new Error(`Vorlage konnte nicht geladen werden (${resp.status})`);
  const vorlage = await resp.arrayBuffer();

  const zip = await JSZip.loadAsync(vorlage);
  const originalOrder: string[] = [];
  zip.forEach((relPath, file) => { if (!file.dir) originalOrder.push(relPath); });

  const sheetXmlDatei = zip.file('xl/worksheets/sheet1.xml');
  const workbookXmlDatei = zip.file('xl/workbook.xml');
  const contentTypesDatei = zip.file('[Content_Types].xml');
  if (!sheetXmlDatei || !workbookXmlDatei || !contentTypesDatei) {
    throw new Error('Vorlage hat nicht die erwartete Struktur (fehlende Kern-Dateien)');
  }

  const sheetXml = patchSheetXml(await sheetXmlDatei.async('string'), SPESEN_NAME_VOLL, year, month, zeilen);
  const workbookXml = patchWorkbookXml(await workbookXmlDatei.async('string'));
  const contentTypesXml = fixContentType(await contentTypesDatei.async('string'));

  zip.file('xl/worksheets/sheet1.xml', sheetXml, { createFolders: false });
  zip.file('xl/workbook.xml', workbookXml, { createFolders: false });
  zip.file('[Content_Types].xml', contentTypesXml, { createFolders: false });

  const blob = await baueXlsxZip(zip, originalOrder);
  return { blob, zeilen };
}
