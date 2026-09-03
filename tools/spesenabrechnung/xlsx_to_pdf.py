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


def xlsx_to_faithful_pdf(xlsx_path: str, out_dir: str, formel_zellen_i_spalte: list[str]) -> str:
    """Erzeugt aus der echten .xlsx eine einzelne PDF-Seite, mit den oben beschriebenen
    gezielten Fixes NUR in dieser Rendering-Kopie (Original-.xlsx bleibt unangetastet).

    formel_zellen_i_spalte: Zellreferenzen der VERPFLEGUNGSMEHRAUFWAND-Formelzellen
    (z.B. ['I11','I12',...,'I41']), deren Formel durch den Cache-Wert ersetzt werden soll.
    """
    out_dir_p = Path(out_dir)
    render_xlsx = out_dir_p / 'render_copy.xlsx'

    with zipfile.ZipFile(xlsx_path, 'r') as zin:
        names = zin.namelist()
        inhalte = {n: zin.read(n) for n in names}

    sheet_xml = inhalte['xl/worksheets/sheet1.xml'].decode('utf-8')
    for ref in formel_zellen_i_spalte:
        sheet_xml = _strip_formula_keep_value(sheet_xml, ref)
    inhalte['xl/worksheets/sheet1.xml'] = sheet_xml.encode('utf-8')

    styles_xml = inhalte['xl/styles.xml'].decode('utf-8')
    styles_xml = _fix_accounting_number_format(styles_xml)
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
