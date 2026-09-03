#!/usr/bin/env python3
"""
Fuehrt die tatsaechliche, ausgefuellte Spesenabrechnung (.xlsx, echt gerendert - siehe
xlsx_to_pdf.py) und die einzelnen Beleg-PDFs zu einem einzigen, direkt einreichbaren
Gesamt-PDF zusammen - wie der Nutzer es fuer Juli 2026 manuell gemacht hat.

Reihenfolge im Ergebnis: zuerst die Spesenabrechnung-Uebersicht, danach die Belege in
derselben Reihenfolge wie die Zeilen der Abrechnung (Datum aufsteigend) - so kann der
Pruefende Zeile fuer Zeile mit den Belegen mitgehen.

Nutzung:
    python3 merge_pdf.py \\
        --template SpesenabrechnungVorlage_neu_ab_012026.xltx \\
        --data monatsdaten.json \\
        --manifest manifest.json \\
        --name "Raoul Hübner" \\
        --output Spesenabrechnung_2026-08_Raoul-Huebner_komplett.pdf

`manifest.json` kommt von fetch_receipts.js (rid -> {file, name, date, ok}).

WICHTIG (03.09.2026): Seite 1 ist die ECHTE, per export_xlsx.py ausgefuellte .xlsx-Vorlage
- keine Nachbildung. Siehe xlsx_to_pdf.py fuer die Details, wie das zuverlaessig (inkl.
Tabellenrahmen und korrekten Werten) zu PDF gerendert wird.
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from datetime import date
from pathlib import Path

from pypdf import PdfWriter, PdfReader
from pdf2image import convert_from_path
import io

sys.path.insert(0, str(Path(__file__).parent))
from export_xlsx import entries_to_zeilen, export, ERSTE_DATENZEILE  # noqa: E402
from xlsx_to_pdf import xlsx_to_faithful_pdf  # noqa: E402

SCAN_DPI = 200  # fuer Text auf einer A4-Seite gut lesbar


def receipt_page_to_bw_image(page_image, tmp_dir, idx):
    """Wandelt EINE rasterisierte Beleg-Seite in Graustufen um.

    WICHTIG (03.09.2026): Es gab hier zwischenzeitlich einen Node/Scanic-Zwischenschritt
    (scan_enhance.mjs) fuer automatischen Randzuschnitt + Beleuchtungskorrektur. Auf
    Nutzerwunsch wieder entfernt ("zu kompliziert, funktioniert nicht zuverlaessig genug") -
    zurueck zum einfachen, direkten Ansatz: nur Graustufen, kein Zuschnitt, keine externe
    Bibliothek noetig. tmp_dir/idx-Parameter bleiben fuer eine gleichbleibende
    Funktionssignatur erhalten, werden aber nicht mehr gebraucht.
    """
    return page_image.convert('L')


def receipt_to_bw_pdf_bytes(pdf_path, tmp_dir):
    """Rasterisiert jede Seite eines Beleg-PDFs und wandelt sie in Graustufen um. JPEG-
    Kompression beim Einbetten (quality=85) haelt die Dateigroesse vernuenftig, ohne die
    Lesbarkeit zu gefaehrden."""
    images = convert_from_path(pdf_path, dpi=SCAN_DPI)
    bw_images = [receipt_page_to_bw_image(img, tmp_dir, i) for i, img in enumerate(images)]
    buf = io.BytesIO()
    bw_images[0].save(buf, format='PDF', save_all=True, append_images=bw_images[1:], quality=85)
    return buf.getvalue()


def merge(template_path: str, data_path: str, manifest_path: str, name: str, output_path: str) -> dict:
    with open(data_path, encoding='utf-8') as f:
        data = json.load(f)
    with open(manifest_path, encoding='utf-8') as f:
        manifest = json.load(f)
    manifest_dir = Path(manifest_path).resolve().parent

    zeilen = entries_to_zeilen(data['days'])
    entries_by_date = {d['date']: d['entry'] for d in data['days'] if d.get('exists')}

    report = {'zeilen_ohne_beleg': [], 'fehlende_belege': [], 'eingebundene_belege': []}

    with tempfile.TemporaryDirectory() as tmp:
        echte_xlsx = str(Path(tmp) / 'spesenabrechnung.xlsx')
        export(template_path, data_path, name, echte_xlsx)

        i_zellen = [f'I{ERSTE_DATENZEILE + i}' for i in range(len(zeilen))] + ['I41']
        datum_zellen = {f'B{ERSTE_DATENZEILE + i}': z.datum.strftime('%d.%m.%Y') for i, z in enumerate(zeilen)}
        von = date(data['year'], data['month'], 1)
        bis_naechster = date(data['year'], data['month'] + 1, 1) if data['month'] < 12 else date(data['year'] + 1, 1, 1)
        bis = date.fromordinal(bis_naechster.toordinal() - 1)
        datum_zellen['H5'] = von.strftime('%d.%m.%Y')
        datum_zellen['H6'] = bis.strftime('%d.%m.%Y')
        sheet_pdf = xlsx_to_faithful_pdf(echte_xlsx, tmp, i_zellen, datum_zellen)

        writer = PdfWriter()
        for page in PdfReader(sheet_pdf).pages:
            writer.add_page(page)

        for z in zeilen:
            date_str = z.datum.isoformat()
            entry = entries_by_date[date_str]
            rids = entry.get('receiptIds', [])
            if not rids:
                report['zeilen_ohne_beleg'].append(date_str)
                continue
            for rid in rids:
                m = manifest.get(rid)
                if not m or not m.get('ok'):
                    report['fehlende_belege'].append({'date': date_str, 'rid': rid,
                                                       'grund': (m or {}).get('error', 'nicht im Manifest')})
                    continue
                bw_pdf_bytes = receipt_to_bw_pdf_bytes(str(manifest_dir / m['file']), tmp)
                reader = PdfReader(io.BytesIO(bw_pdf_bytes))
                for page in reader.pages:
                    writer.add_page(page)
                report['eingebundene_belege'].append({'date': date_str, 'rid': rid, 'name': m.get('name')})

        with open(output_path, 'wb') as f:
            writer.write(f)

    return report


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--template', required=True, help='Pfad zur SpesenabrechnungVorlage_*.xltx')
    p.add_argument('--data', required=True)
    p.add_argument('--manifest', required=True)
    p.add_argument('--name', required=True, help='Name des Mitarbeiters fuer die Uebersichtsseite')
    p.add_argument('--output', required=True)
    args = p.parse_args()

    report = merge(args.template, args.data, args.manifest, args.name, args.output)

    print(f'{len(report["eingebundene_belege"])} Beleg-Seite(n) eingebunden:')
    for e in report['eingebundene_belege']:
        print(f'  {e["date"]}: {e["name"]}')
    if report['zeilen_ohne_beleg']:
        print(f'\nZeilen ohne jeden Beleg ({len(report["zeilen_ohne_beleg"])}):')
        for d in report['zeilen_ohne_beleg']:
            print(f'  {d}')
    if report['fehlende_belege']:
        print(f'\n⚠ FEHLENDE Belege ({len(report["fehlende_belege"])}) - bitte pruefen:')
        for m in report['fehlende_belege']:
            print(f'  {m["date"]} ({m["rid"]}): {m["grund"]}')
        sys.exit(1)

    print(f'\nGeschrieben: {args.output}')


if __name__ == '__main__':
    main()
