#!/usr/bin/env python3
"""
Rendert die tatsaechliche, ausgefuellte Spesenabrechnungs-.xlsx (aus export_xlsx.py) als
Seite 1 des Gesamt-PDFs - die ECHTE Excel-Tabelle, keine Nachbildung.

WARUM DIESER UMWEG (03.09.2026, nach zwei gescheiterten Nachbau-Versuchen per reportlab -
der Nutzer besteht zu Recht darauf, dass die echte Vorlage 1:1 durchgereicht wird):

Direktes `soffice --convert-to pdf` auf die .xlsx verliert Tabellenrahmen komplett
(reproduziert auch an der VOELLIG UNVERAENDERTEN Original-Vorlage - siehe
CLAUDE_CHECKLIST.md). Ursache: die Rahmenfarben in der Vorlage sind ueber Theme-Farbe+Tint
kodiert (`<color theme="0" tint="-0.499..."/>`), nicht als direktes RGB - LibreOffice
loest das beim direkten XLSX-PDF-Export offenbar nicht korrekt auf. Ein Umweg ueber ODS
als Zwischenformat (XLSX -> ODS -> PDF) behebt das zuverlaessig (Rahmen erscheinen
korrekt), bringt aber zwei neue, behobene Probleme mit:

1. Das komplexe Buchhaltungs-Zahlenformat der Vorlage (`_([$€-2]\\ * #,##0.00_);...`,
   numFmtId 173/34/44) wird von LibreOffices ODS-Export nicht sauber uebersetzt und zeigt
   den rohen Formatcode als Text ("_(€ 14.00_)" statt "14,00 €"). Fix: dieses Format wird
   in einer eigenen Kopie der Datei (nur fuers Rendern, NICHT in der echten .xlsx) durch
   ein einfaches, gleichwertiges Format ersetzt.
2. Die VERPFLEGUNGSMEHRAUFWAND-Spalte nutzt `_xlfn.LET` - LibreOffice versucht das
   IMMER auszuwerten (auch ohne fullCalcOnLoad) und zeigt "#NAME?", obwohl der korrekte,
   vorberechnete Wert bereits im Cache steht. Fix: die Formel wird in der Rendering-Kopie
   durch ihren eigenen, bereits korrekt vorberechneten Wert ersetzt (keine Formel mehr,
   die ausgewertet werden muesste) - NUR in der Rendering-Kopie, die echte .xlsx (falls
   separat gebraucht) bleibt mit echter Formel unangetastet.
"""
from __future__ import annotations

import re
import subprocess
import zipfile
from pathlib import Path


def _find_cell(xml: str, ref: str):
    m = re.search(rf'<c r="{ref}"([^>]*?)/>', xml)
    if m:
        return m, None, True
    m = re.search(rf'<c r="{ref}"([^>]*)>(.*?)</c>', xml, re.DOTALL)
    if not m:
        raise ValueError(f'Zelle {ref} nicht gefunden')
    return m, m.group(2), False


def _strip_formula_keep_value(xml: str, ref: str) -> str:
    """Ersetzt eine Formelzelle durch ihren eigenen zwischengespeicherten Wert - keine
    Formel mehr, die ein Renderer auszuwerten versuchen koennte."""
    m, inner, self_closing = _find_cell(xml, ref)
    if self_closing or inner is None or '<v>' not in inner:
        return xml  # keine Formel/kein Cache-Wert vorhanden - unveraendert lassen
    v_match = re.search(r'<v>([^<]*)</v>', inner)
    if not v_match:
        return xml
    value = v_match.group(1)
    attrs = m.group(1)
    s_match = re.search(r's="(\d+)"', attrs)
    s_attr = f' s="{s_match.group(1)}"' if s_match else ''
    new_cell = f'<c r="{ref}"{s_attr}><v>{value}</v></c>'
    return xml[:m.start()] + new_cell + xml[m.end():]


def _add_table_grid_borders(styles_xml: str) -> str:
    """Die Haupttabelle (das Excel-Tabellenobjekt 'Spesen') nutzt fuer ihr sichtbares Gitter
    einen BENUTZERDEFINIERTEN TABELLENSTIL ('Spesenabrechnung', wholeTable-Element dxfId=25),
    NICHT echte Rahmen an den einzelnen Zellen (alle betroffenen Zellstile haben
    borderId="0"). Echtes Excel rendert diesen Tabellenstil automatisch; LibreOffice tut
    das nicht (weder direkt noch ueber ODS) - deshalb fehlt das Gitter dort, waehrend die
    Nebentabelle (Reiseland/Art des Reisetages), die echte Zellrahmen nutzt, korrekt
    erscheint. Fix: dieselbe Rahmen-Definition wie im Tabellenstil (per Hand aus dxfId=25
    uebernommen) wird als echter, benannter Rahmen ergaenzt und den betroffenen Zellstilen
    zugewiesen - NUR in dieser Rendering-Kopie."""
    # Neue Rahmen-Definition anhaengen (identisch zum wholeTable-Element des Tabellenstils)
    neuer_rahmen = ('<border diagonalUp="0" diagonalDown="0">'
                     '<left style="thin"><color theme="0" tint="-0.499984740745262"/></left>'
                     '<right style="thin"><color theme="0" tint="-0.499984740745262"/></right>'
                     '<top style="thin"><color theme="0" tint="-0.499984740745262"/></top>'
                     '<bottom style="thin"><color theme="0" tint="-0.499984740745262"/></bottom>'
                     '<diagonal/></border>')
    m = re.search(r'<borders count="(\d+)">', styles_xml)
    if not m:
        raise ValueError('<borders>-Element nicht gefunden - Vorlage geaendert?')
    alte_anzahl = int(m.group(1))
    neue_border_id = alte_anzahl
    styles_xml = styles_xml.replace(f'<borders count="{alte_anzahl}">', f'<borders count="{alte_anzahl + 1}">')
    styles_xml = styles_xml.replace('</borders>', neuer_rahmen + '</borders>')

    # Betroffene Zellstile: alle Stilindizes, die in der Haupttabelle (B10:K41) tatsaechlich
    # verwendet werden UND aktuell borderId="0" (kein Rahmen) haben - siehe Docstring.
    betroffene_stile = [20, 21, 26, 27, 28, 29, 30, 31, 32, 35, 37]
    cellxfs_match = re.search(r'(<cellXfs count="\d+">)(.*?)(</cellXfs>)', styles_xml, re.DOTALL)
    if not cellxfs_match:
        raise ValueError('<cellXfs>-Element nicht gefunden - Vorlage geaendert?')
    xf_liste = re.findall(r'<xf[^>]*(?:/>|>.*?</xf>)', cellxfs_match.group(2), re.DOTALL)
    for idx in betroffene_stile:
        alt = xf_liste[idx]
        if 'borderId="0"' not in alt:
            raise ValueError(f'Zellstil {idx}: erwartetes borderId="0" nicht gefunden - Vorlage geaendert?')
        xf_liste[idx] = alt.replace('borderId="0"', f'borderId="{neue_border_id}"')
    neuer_cellxfs_inhalt = ''.join(xf_liste)
    styles_xml = (styles_xml[:cellxfs_match.start()] + cellxfs_match.group(1) + neuer_cellxfs_inhalt
                  + cellxfs_match.group(3) + styles_xml[cellxfs_match.end():])
    return styles_xml


def _dates_as_text(sheet_xml: str, datum_zellen: dict) -> str:
    """LibreOffice ignoriert ueber den XLSX->ODS->PDF-Konvertierungsweg JEDES numFmt fuer
    Datumszellen (getestet mit mehreren expliziten Formatcodes, inkl. Gebietsschema-Praefix
    [$-407] - keine Wirkung, immer M/D/YYYY-Kurzform) - vermutlich weil die Umgebung keine
    deutsche Locale installiert hat und LibreOffice intern auf einen Gebietsschema-
    abhaengigen Kurzform-Fallback zurueckfaellt, der das Zellformat ignoriert. Einzig
    zuverlaessiger Fix: die Datumszellen NICHT als Zahl+Format, sondern direkt als
    vorformatierter Text ausgeben - das umgeht jede Formatinterpretation komplett.
    datum_zellen: {zellreferenz: vorformatierter Text, z.B. {'B11': '01.08.2026'}}."""
    from xml.sax.saxutils import escape
    for ref, text in datum_zellen.items():
        m = re.search(rf'<c r="{ref}"([^>]*)>.*?</c>|<c r="{ref}"([^>]*)/>', sheet_xml, re.DOTALL)
        if not m:
            raise ValueError(f'Datumszelle {ref} nicht gefunden')
        attrs = m.group(1) or m.group(2)
        s_match = re.search(r's="(\d+)"', attrs)
        s_attr = f' s="{s_match.group(1)}"' if s_match else ''
        neue_zelle = f'<c r="{ref}"{s_attr} t="inlineStr"><is><t xml:space="preserve">{escape(text)}</t></is></c>'
        sheet_xml = sheet_xml[:m.start()] + neue_zelle + sheet_xml[m.end():]
    return sheet_xml


def _fix_accounting_number_format(styles_xml: str) -> str:
    """Das Buchhaltungsformat mit `_(`/`* `-Ausrichtungstricks wird von LibreOffices
    ODS-Export nicht sauber uebersetzt (roher Formatcode erscheint als Text). Ersetzt durch
    ein einfaches, optisch sehr aehnliches Format ohne diese Tricks - NUR in dieser
    Rendering-Kopie, nicht in der echten .xlsx."""
    hauptformat_alt = '_([$€-2]\\ * #,##0.00_);_([$€-2]\\ * \\(#,##0.00\\);_([$€-2]\\ * &quot;-&quot;??_);_(@_)'
    einfaches_format = '#,##0.00\\ &quot;€&quot;;-#,##0.00\\ &quot;€&quot;;&quot;-&quot;\\ &quot;€&quot;'
    if hauptformat_alt not in styles_xml:
        raise ValueError('Erwartetes Zahlenformat (numFmtId 173) nicht gefunden - Vorlage geaendert?')
    styles_xml = styles_xml.replace(hauptformat_alt, einfaches_format)

    # Zweite bekannte Variante (numFmtId 34/44) - nicht garantiert in jeder Vorlagenversion
    # tatsaechlich benutzt, daher nur ersetzen falls vorhanden, kein harter Fehler.
    zweites_format_alt = '_-* #,##0.00\\ &quot;€&quot;_-;\\-* #,##0.00\\ &quot;€&quot;_-;_-* &quot;-&quot;??\\ &quot;€&quot;_-;_-@_-'
    styles_xml = styles_xml.replace(zweites_format_alt, einfaches_format)
    return styles_xml


def xlsx_to_faithful_pdf(xlsx_path: str, out_dir: str, formel_zellen_i_spalte: list[str],
                         datum_zellen: dict) -> str:
    """Erzeugt aus der echten .xlsx eine einzelne PDF-Seite, mit den oben beschriebenen
    gezielten Fixes NUR in dieser Rendering-Kopie (Original-.xlsx bleibt unangetastet).

    formel_zellen_i_spalte: Zellreferenzen der VERPFLEGUNGSMEHRAUFWAND-Formelzellen
    (z.B. ['I11','I12',...,'I41']), deren Formel durch den Cache-Wert ersetzt werden soll.
    datum_zellen: {zellreferenz: vorformatierter Text} fuer die DATUM-Spalte, z.B.
    {'B11': '01.08.2026', ...} - siehe _dates_as_text().
    """
    out_dir_p = Path(out_dir)
    render_xlsx = out_dir_p / 'render_copy.xlsx'

    with zipfile.ZipFile(xlsx_path, 'r') as zin:
        names = zin.namelist()
        inhalte = {n: zin.read(n) for n in names}

    sheet_xml = inhalte['xl/worksheets/sheet1.xml'].decode('utf-8')
    for ref in formel_zellen_i_spalte:
        sheet_xml = _strip_formula_keep_value(sheet_xml, ref)
    sheet_xml = _dates_as_text(sheet_xml, datum_zellen)
    inhalte['xl/worksheets/sheet1.xml'] = sheet_xml.encode('utf-8')

    styles_xml = inhalte['xl/styles.xml'].decode('utf-8')
    styles_xml = _fix_accounting_number_format(styles_xml)
    styles_xml = _add_table_grid_borders(styles_xml)
    inhalte['xl/styles.xml'] = styles_xml.encode('utf-8')

    with zipfile.ZipFile(render_xlsx, 'w', zipfile.ZIP_DEFLATED) as zout:
        for name in names:
            zout.writestr(name, inhalte[name])

    # XLSX -> ODS -> PDF: der ODS-Zwischenschritt behebt die fehlenden Tabellenrahmen
    # (siehe Docstring oben) - direktes XLSX->PDF verliert sie nachweislich.
    result = subprocess.run(
        ['soffice', '--headless', '--norestore', '--convert-to', 'ods', '--outdir', str(out_dir_p), str(render_xlsx)],
        capture_output=True, text=True, timeout=90,
    )
    if result.returncode != 0:
        raise RuntimeError(f'LibreOffice ODS-Konvertierung fehlgeschlagen: {result.stderr}')
    ods_path = out_dir_p / 'render_copy.ods'
    if not ods_path.exists():
        raise RuntimeError(f'Erwartete ODS-Datei {ods_path} wurde nicht erzeugt')

    result = subprocess.run(
        ['soffice', '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', str(out_dir_p), str(ods_path)],
        capture_output=True, text=True, timeout=90,
    )
    if result.returncode != 0:
        raise RuntimeError(f'LibreOffice PDF-Konvertierung fehlgeschlagen: {result.stderr}')
    pdf_path = out_dir_p / 'render_copy.pdf'
    if not pdf_path.exists():
        raise RuntimeError(f'Erwartete PDF-Datei {pdf_path} wurde nicht erzeugt')
    return str(pdf_path)
