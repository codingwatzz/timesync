#!/usr/bin/env python3
"""
Spesenabrechnung-Export: befuellt SpesenabrechnungVorlage_neu_ab_012026.xltx chirurgisch
(direkte XML-Bearbeitung, kein openpyxl-Neuaufbau) mit den Monatsdaten aus der
Zeiterfassungs-App und liefert eine sofort einreichbare .xlsx zurueck.

WARUM CHIRURGISCH STATT openpyxl:
openpyxl entfernt beim Speichern die erweiterten Datenvalidierungen (Dropdown-Listen fuer
Reiseland/Art des Reisetages) - openpyxl warnt das selbst beim Laden ("Data Validation
extension is not supported and will be removed"). Dieses Skript aendert nur die noetigen
Zellen direkt in der rohen sheet1.xml und zippt das Paket in EXAKT der Original-
Dateireihenfolge neu - alles andere (Formeln, Dropdowns, Tabellenobjekt, Layout) bleibt
byte-identisch zur Vorlage.

FALLSTRICKE, DIE DIESES SKRIPT AUTOMATISCH ABFAENGT (alle real aufgetreten am 02.09.2026,
siehe PROJEKT_UEBERSICHT.md):

1. ZIP-Verzeichnis-Eintraege: `zip -r` erzeugt explizite 0-Byte-Verzeichnis-Eintraege
   (z.B. "_rels/"), die das Original nicht hat - manche Excel-Versionen lehnen das ab.
   -> Dieses Skript zippt nur echte Dateien, in exakter Original-Reihenfolge.

2. Selbstschliessende Formelzellen: Manche Zellen (z.B. Zeile 13-16 in Spalte I) nutzen
   `<f t="shared" si="0"/>` OHNE eigenes `</f>` - eine Regex, die nach "</f>" sucht, um eine
   Zelle zu begrenzen, laeuft dadurch quer durch die Datei und zerstoert die Struktur.
   -> Dieses Skript begrenzt Zellen IMMER an der eigenen "</c>" (eindeutig, nie mehrdeutig),
      nie an "</f>".

3. Content-Type-Mismatch: Die Vorlage ist eine .xltx - intern als
   "spreadsheetml.template.main+xml" deklariert. Speichert man das Ergebnis als .xlsx OHNE
   diese Deklaration anzupassen, sagt Excel "Dateiformat oder Dateierweiterung ungueltig"
   und verweigert das Oeffnen komplett.
   -> Dieses Skript korrigiert den Content-Type auf "spreadsheetml.sheet.main+xml".

4. Veraltete Formel-Caches: Neu gesetzte Werte (z.B. GEFAHRENE KM) aendern nicht automatisch
   die zwischengespeicherten Werte der abhaengigen Formelzellen (KM-PAUSCHALE, SUMME) - ob
   Excel beim Oeffnen zuverlaessig neu rechnet, ist nicht in jedem Fall sicher.
   -> Dieses Skript berechnet die korrekten Werte selbst (Python-Nachbildung der Formellogik,
      identisch zu app/src/core/vma.ts) und schreibt sie als Cache direkt mit.

5. VERPFLEGUNGS-MEHRAUFWAND-Formel nutzt `_xlfn.LET` - eine moderne Excel-Funktion, die
   LibreOffice nicht auswerten kann (zeigt "#NAME?" beim Testen). Das ist eine reine
   Werkzeug-Einschraenkung der Verifikation, keine Beschaedigung der Datei - im echten Excel
   des Nutzers funktioniert diese Formel nachweislich (identische Formel im vom Nutzer
   bereits erfolgreich eingereichten Juli-2026-Beispiel).

Nutzung:
    python3 export_xlsx.py \\
        --template /pfad/zur/Vorlage.xltx \\
        --data monatsdaten.json \\
        --name "Raoul Hübner" \\
        --output Spesenabrechnung.xlsx

`monatsdaten.json` hat die Form (siehe fetch_month.js):
    {
      "year": 2026, "month": 8,
      "days": [ { "date": "2026-08-01", "exists": true, "entry": {...TagesEintrag...} }, ... ]
    }
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from dataclasses import dataclass
from datetime import date
from xml.sax.saxutils import escape

# ============================================================================
# VMA-Saetze - 1:1 aus app/src/core/vma.ts uebernommen. Bei Aenderung dort IMMER
# auch hier synchron halten (und umgekehrt).
# ============================================================================
SAETZE = {
    'Deutschland': {'ganztags': 28, 'teiltags': 14},
    'Österreich': {'ganztags': 50, 'teiltags': 33},
    'Schweiz': {'ganztags': 64, 'teiltags': 43},
}
# Rein interne App-Markierung, kein Wert aus der echten Vorlage - MUSS beim Export wie
# leer/kein Anspruch behandelt werden (siehe core/vma.ts-Kommentar).
INTERNE_MARKIERUNG_REISEART = 'Abwesenheitstag (<8h)'

MAX_DATENZEILEN = 30  # Zeilen 11-40 der Vorlage
ERSTE_DATENZEILE = 11
EXCEL_EPOCH = date(1899, 12, 30)


def excel_serial(d: date) -> int:
    return (d - EXCEL_EPOCH).days


def to_number(v) -> float:
    if v in (None, ''):
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def berechne_vma(reiseland: str, reiseart: str, fr: bool, mi: bool, ab: bool) -> float:
    """Identische Logik zu app/src/core/vma.ts::verpflegungsmehraufwand()."""
    if not reiseart or reiseart == INTERNE_MARKIERUNG_REISEART:
        return 0.0
    saetze = SAETZE.get(reiseland, SAETZE['Deutschland'])
    basis = saetze['ganztags'] if reiseart == 'Abwesenheitstag (24h)' else saetze['teiltags']
    kuerzung_prozent = min(100, (20 if fr else 0) + (40 if mi else 0) + (40 if ab else 0))
    betrag = basis * (1 - kuerzung_prozent / 100)
    cents = round(betrag * 100 + 1e-9)
    return max(0.0, cents / 100)


@dataclass
class ExportZeile:
    datum: date
    beschreibung: str
    hotel: float
    transport: float
    bewirtung: float
    km: float | None  # None = Feld bleibt leer (kein km-Eintrag)
    sonstiges: float
    reiseland: str
    reiseart: str | None  # None = O/P/Q/R bleiben leer (kein VMA-Anspruch)
    fr: bool
    mi: bool
    ab: bool

    @property
    def km_pauschale(self) -> float:
        return round((self.km or 0) * 0.3, 10)

    @property
    def vma(self) -> float:
        if self.reiseart is None:
            return 0.0
        return berechne_vma(self.reiseland, self.reiseart, self.fr, self.mi, self.ab)

    @property
    def summe(self) -> float:
        return round(self.hotel + self.transport + self.bewirtung + self.km_pauschale + self.vma + self.sonstiges, 10)


def ist_relevanter_tag(entry: dict) -> bool:
    """Ein Tag wird zu einer Export-Zeile, wenn er Kosten- oder Reiseart-relevante Daten
    hat - entspricht der Vollstaendigkeitspruefungs-Logik vom 02.09.2026. Reine
    Homeoffice-/Buerotage ohne jede Ausgabe werden NICHT exportiert (die Vorlage ist ein
    Ausgaben-Log, kein Anwesenheitskalender - siehe Beispiel-Vorlage: nur 10 von 31
    Kalendertagen im Juli 2026 wurden zu Zeilen)."""
    kosten = (to_number(entry.get('km')) > 0 or to_number(entry.get('transport')) > 0
              or to_number(entry.get('hotel')) > 0 or to_number(entry.get('bewirtung')) > 0
              or to_number(entry.get('sonstiges')) > 0)
    return kosten or bool(entry.get('reiseart'))


def entries_to_zeilen(days: list[dict]) -> list[ExportZeile]:
    zeilen = []
    for d in days:
        if not d.get('exists'):
            continue
        entry = d['entry']
        if not ist_relevanter_tag(entry):
            continue
        y, m, day = (int(x) for x in d['date'].split('-'))
        reiseart = entry.get('reiseart') or ''
        zeilen.append(ExportZeile(
            datum=date(y, m, day),
            beschreibung=entry.get('beschreibung', ''),
            hotel=to_number(entry.get('hotel')),
            transport=to_number(entry.get('transport')),
            bewirtung=to_number(entry.get('bewirtung')),
            km=to_number(entry.get('km')) or None,
            sonstiges=to_number(entry.get('sonstiges')),
            reiseland=entry.get('reiseland') or 'Deutschland',
            reiseart=(None if reiseart in ('', INTERNE_MARKIERUNG_REISEART) else reiseart),
            fr=bool(entry.get('fr')), mi=bool(entry.get('mi')), ab=bool(entry.get('ab')),
        ))
    zeilen.sort(key=lambda z: z.datum)
    return zeilen


# ============================================================================
# XML-Zellmanipulation - begrenzt IMMER an "</c>" bzw. eigenem "/>", NIE an "</f>"
# (siehe Fallstrick 2 oben).
# ============================================================================

def _find_cell(xml: str, ref: str):
    m = re.search(rf'<c r="{ref}"([^>]*?)/>', xml)
    if m:
        return m, None, True
    m = re.search(rf'<c r="{ref}"([^>]*)>(.*?)</c>', xml, re.DOTALL)
    if not m:
        raise ValueError(f'Zelle {ref} nicht in der Vorlage gefunden')
    return m, m.group(2), False


def _style_attr(attrs: str) -> str:
    m = re.search(r's="(\d+)"', attrs)
    return f' s="{m.group(1)}"' if m else ''


def xml_set_number(xml: str, ref: str, value: float) -> str:
    m, _, _ = _find_cell(xml, ref)
    new_cell = f'<c r="{ref}"{_style_attr(m.group(1))}><v>{value}</v></c>'
    return xml[:m.start()] + new_cell + xml[m.end():]


def xml_set_inline_string(xml: str, ref: str, text: str) -> str:
    m, _, _ = _find_cell(xml, ref)
    new_cell = (f'<c r="{ref}"{_style_attr(m.group(1))} t="inlineStr">'
                f'<is><t xml:space="preserve">{escape(text)}</t></is></c>')
    return xml[:m.start()] + new_cell + xml[m.end():]


def xml_set_blank(xml: str, ref: str) -> str:
    m, _, _ = _find_cell(xml, ref)
    return xml[:m.start()] + f'<c r="{ref}"{_style_attr(m.group(1))}/>' + xml[m.end():]


def xml_set_cached_formula_value(xml: str, ref: str, value: float) -> str:
    """Aendert NUR den <v>-Cache einer Formelzelle, laesst <f> (egal ob selbstschliessend
    oder nicht) unangetastet."""
    m, inner, self_closing = _find_cell(xml, ref)
    if self_closing:
        raise ValueError(f'{ref} ist eine leere Zelle ohne Formel')
    if '<f' not in inner:
        raise ValueError(f'{ref} enthaelt keine Formel: {inner[:80]!r}')
    new_inner, n = re.subn(r'<v>[^<]*</v>', f'<v>{value}</v>', inner)
    if n == 0:
        new_inner = inner + f'<v>{value}</v>'
    elif n > 1:
        raise ValueError(f'{ref}: mehrere <v> in einer Zelle - unerwartet')
    return xml[:m.start()] + f'<c r="{ref}"{m.group(1)}>{new_inner}</c>' + xml[m.end():]


# ============================================================================
# Haupt-Patch-Funktion
# ============================================================================

def patch_sheet_xml(sheet_xml: str, name: str, jahr: int, monat: int, zeilen: list[ExportZeile]) -> str:
    if len(zeilen) > MAX_DATENZEILEN:
        raise ValueError(
            f'{len(zeilen)} Export-Zeilen, aber die Vorlage hat nur Platz fuer '
            f'{MAX_DATENZEILEN} (Zeilen 11-40). Vorlage muesste erweitert werden.')

    xml = sheet_xml
    xml = xml_set_inline_string(xml, 'C5', name)
    von = date(jahr, monat, 1)
    bis = date(jahr, monat + 1, 1) if monat < 12 else date(jahr + 1, 1, 1)
    bis = date.fromordinal(bis.toordinal() - 1)
    xml = xml_set_number(xml, 'H5', excel_serial(von))
    xml = xml_set_number(xml, 'H6', excel_serial(bis))

    summen = {'D': 0.0, 'E': 0.0, 'F': 0.0, 'H': 0.0, 'I': 0.0, 'J': 0.0, 'K': 0.0}
    for i, z in enumerate(zeilen):
        row = ERSTE_DATENZEILE + i
        xml = xml_set_number(xml, f'B{row}', excel_serial(z.datum))
        xml = xml_set_inline_string(xml, f'C{row}', z.beschreibung)
        xml = xml_set_number(xml, f'D{row}', z.hotel)
        xml = xml_set_number(xml, f'E{row}', z.transport)
        xml = xml_set_number(xml, f'F{row}', z.bewirtung)
        if z.km is not None:
            xml = xml_set_number(xml, f'G{row}', z.km)
        else:
            xml = xml_set_blank(xml, f'G{row}')
        xml = xml_set_number(xml, f'J{row}', z.sonstiges)
        xml = xml_set_inline_string(xml, f'N{row}', z.reiseland)
        if z.reiseart is not None:
            xml = xml_set_inline_string(xml, f'O{row}', z.reiseart)
            xml = xml_set_inline_string(xml, f'P{row}', 'Ja' if z.fr else 'Nein')
            xml = xml_set_inline_string(xml, f'Q{row}', 'Ja' if z.mi else 'Nein')
            xml = xml_set_inline_string(xml, f'R{row}', 'Ja' if z.ab else 'Nein')
        else:
            for col in 'OPQR':
                xml = xml_set_blank(xml, f'{col}{row}')

        xml = xml_set_cached_formula_value(xml, f'H{row}', z.km_pauschale)
        xml = xml_set_cached_formula_value(xml, f'I{row}', z.vma)
        xml = xml_set_cached_formula_value(xml, f'K{row}', z.summe)
        summen['D'] += z.hotel
        summen['E'] += z.transport
        summen['F'] += z.bewirtung
        summen['H'] += z.km_pauschale
        summen['I'] += z.vma
        summen['J'] += z.sonstiges
        summen['K'] += z.summe

    for col, val in summen.items():
        xml = xml_set_cached_formula_value(xml, f'{col}41', round(val, 10))

    return xml


def patch_workbook_xml(workbook_xml: str) -> str:
    """fullCalcOnLoad erzwingen - falls Excel die Cache-Werte doch verwirft, soll frisch
    neu gerechnet werden (Sicherheitsnetz zusaetzlich zu den korrekten Caches)."""
    new_xml, n = re.subn(r'<calcPr calcId="(\d+)"/>', r'<calcPr calcId="\1" fullCalcOnLoad="1"/>', workbook_xml)
    if n != 1:
        raise ValueError('calcPr-Element nicht wie erwartet gefunden - workbook.xml pruefen')
    return new_xml


def fix_content_type(content_types_xml: str) -> str:
    """Fallstrick 3: .xltx-Vorlage ist intern als Template deklariert - fuer eine
    einreichbare .xlsx muss das auf den normalen Arbeitsmappen-Typ umgestellt werden."""
    old = 'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml'
    new = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
    if old not in content_types_xml:
        raise ValueError('Erwarteter Template-Content-Type nicht gefunden - Vorlage geaendert?')
    return content_types_xml.replace(old, new)


# ============================================================================
# Verifikation - laeuft IMMER automatisch, bricht mit Exception ab, falls irgendetwas
# nicht stimmt. Kein "hoffentlich passt es" mehr.
# ============================================================================

def verify(original_sheet_xml: str, patched_sheet_xml: str, n_zeilen: int,
           original_content_types: str, patched_content_types: str) -> list[str]:
    report = []

    def count_cells(xml):
        return len(re.findall(r'<c r="', xml))

    orig_cells, new_cells = count_cells(original_sheet_xml), count_cells(patched_sheet_xml)
    assert orig_cells == new_cells, f'Zellenzahl veraendert: {orig_cells} -> {new_cells}'
    report.append(f'Zellenzahl unveraendert ({new_cells})')

    # Zeilen NACH den benutzten Datenzeilen muessen 1:1 identisch zum Original sein.
    letzte_benutzte_zeile = ERSTE_DATENZEILE + n_zeilen - 1
    diffs = 0
    for row in range(letzte_benutzte_zeile + 1, ERSTE_DATENZEILE + MAX_DATENZEILEN):
        for col in ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'N', 'O', 'P', 'Q', 'R']:
            ref = f'{col}{row}'
            o = _find_cell(original_sheet_xml, ref)[1:]
            n = _find_cell(patched_sheet_xml, ref)[1:]
            if o != n:
                diffs += 1
    assert diffs == 0, f'{diffs} unerwartete Aenderungen in unbenutzten Zeilen gefunden'
    report.append(f'Unbenutzte Zeilen ({letzte_benutzte_zeile + 1}-{ERSTE_DATENZEILE + MAX_DATENZEILEN - 1}) unveraendert')

    # T-Spalte (Erlaeuterungen) darf NIE angefasst worden sein.
    for row in range(ERSTE_DATENZEILE, ERSTE_DATENZEILE + MAX_DATENZEILEN):
        o = _find_cell(original_sheet_xml, f'T{row}')[1:]
        n = _find_cell(patched_sheet_xml, f'T{row}')[1:]
        assert o == n, f'T{row} wurde veraendert (sollte nie passieren)'
    report.append('T-Spalte (Erlaeuterungen) unveraendert')

    assert 'x14:dataValidation' in patched_sheet_xml, 'Dropdown-Validierungen fehlen!'
    orig_dv = original_sheet_xml.count('x14:dataValidation')
    new_dv = patched_sheet_xml.count('x14:dataValidation')
    assert orig_dv == new_dv, f'Anzahl Datenvalidierungen veraendert: {orig_dv} -> {new_dv}'
    report.append(f'Dropdown-Validierungen vollstaendig ({new_dv})')

    old_ct = 'spreadsheetml.template.main+xml'
    new_ct = 'spreadsheetml.sheet.main+xml'
    assert old_ct not in patched_content_types, 'Content-Type ist noch als Vorlage deklariert!'
    assert new_ct in patched_content_types, 'Content-Type nicht korrekt auf Arbeitsmappe gesetzt!'
    report.append('Content-Type korrekt (Arbeitsmappe, nicht Vorlage)')

    import xml.dom.minidom as _m
    _m.parseString(patched_sheet_xml)
    report.append('sheet1.xml wohlgeformt')

    return report


# ============================================================================
# Ein-/Ausgabe: Zip-Neubau in Original-Reihenfolge, keine Verzeichnis-Eintraege.
# ============================================================================

def build_output_zip(template_path: str, output_path: str, sheet_xml: str,
                      workbook_xml: str, content_types_xml: str) -> None:
    with zipfile.ZipFile(template_path, 'r') as zin:
        names_in_order = zin.namelist()
        originals = {n: zin.read(n) for n in names_in_order}

    originals['xl/worksheets/sheet1.xml'] = sheet_xml.encode('utf-8')
    originals['xl/workbook.xml'] = workbook_xml.encode('utf-8')
    originals['[Content_Types].xml'] = content_types_xml.encode('utf-8')

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
        for name in names_in_order:  # exakte Original-Reihenfolge, keine Verzeichnis-Eintraege
            zout.writestr(name, originals[name])


def export(template_path: str, data_path: str, name: str, output_path: str) -> None:
    with open(data_path, encoding='utf-8') as f:
        data = json.load(f)
    zeilen = entries_to_zeilen(data['days'])
    print(f'{len(zeilen)} relevante Tage von {len(data["days"])} Kalendertagen gefunden.')
    for z in zeilen:
        print(f'  {z.datum}: {z.beschreibung!r} - km={z.km} sonstiges={z.sonstiges} '
              f'reiseart={z.reiseart!r} -> Summe={z.summe:.2f}')
    gesamt = sum(z.summe for z in zeilen)
    print(f'Erwartete Gesamtsumme: {gesamt:.2f} EUR')

    with zipfile.ZipFile(template_path, 'r') as z:
        original_sheet_xml = z.read('xl/worksheets/sheet1.xml').decode('utf-8')
        original_workbook_xml = z.read('xl/workbook.xml').decode('utf-8')
        original_content_types = z.read('[Content_Types].xml').decode('utf-8')

    patched_sheet_xml = patch_sheet_xml(original_sheet_xml, data.get('name', name),
                                        data['year'], data['month'], zeilen)
    patched_workbook_xml = patch_workbook_xml(original_workbook_xml)
    patched_content_types = fix_content_type(original_content_types)

    report = verify(original_sheet_xml, patched_sheet_xml, len(zeilen),
                     original_content_types, patched_content_types)
    print('\nVerifikation:')
    for line in report:
        print(f'  \u2713 {line}')

    build_output_zip(template_path, output_path, patched_sheet_xml,
                      patched_workbook_xml, patched_content_types)
    print(f'\nGeschrieben: {output_path}')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--template', required=True, help='Pfad zur SpesenabrechnungVorlage_*.xltx')
    p.add_argument('--data', required=True, help='Pfad zur Monatsdaten-JSON (siehe fetch_month.js)')
    p.add_argument('--name', default='', help='Name des Mitarbeiters (Fallback, falls nicht in --data)')
    p.add_argument('--output', required=True, help='Pfad der zu erzeugenden .xlsx')
    args = p.parse_args()
    export(args.template, args.data, args.name, args.output)


if __name__ == '__main__':
    main()
