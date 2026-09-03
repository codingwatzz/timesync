#!/usr/bin/env python3
"""
Fuehrt die ausgefuellte Spesenabrechnung (.xlsx, als PDF gerendert) und die einzelnen
Beleg-PDFs zu einem einzigen, direkt einreichbaren Gesamt-PDF zusammen - wie der Nutzer es
fuer Juli 2026 manuell gemacht hat.

Reihenfolge im Ergebnis: zuerst die Spesenabrechnung-Seite, danach die Belege in derselben
Reihenfolge wie die Zeilen der Abrechnung (Datum aufsteigend) - so kann der Pruefende Zeile
fuer Zeile mit den Belegen mitgehen.

Nutzung:
    python3 merge_pdf.py \\
        --xlsx Spesenabrechnung_2026-08_Raoul-Huebner.xlsx \\
        --data monatsdaten.json \\
        --manifest manifest.json \\
        --output Spesenabrechnung_2026-08_Raoul-Huebner_komplett.pdf

`manifest.json` kommt von fetch_receipts.js (rid -> {file, name, date, ok}).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from pypdf import PdfWriter, PdfReader
from pdf2image import convert_from_path
from PIL import Image
import io

sys.path.insert(0, str(Path(__file__).parent))
from export_xlsx import entries_to_zeilen  # noqa: E402

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


def xlsx_to_pdf(xlsx_path: str, out_dir: str) -> str:
    """Rendert die .xlsx per LibreOffice zu PDF (dieselbe Methode wie zur Verifikation in
    export_xlsx.py/README.md - bekannte Einschraenkung: die VERPFLEGUNGS-MEHRAUFWAND-Spalte
    zeigt dabei "#NAME?", weil LibreOffice die `_xlfn.LET`-Formel nicht auswerten kann. Das
    ist eine reine Rendering-Einschraenkung dieses Werkzeugs - im Original bleiben die
    korrekt vorberechneten Cache-Werte erhalten, nur die LIVE-NEUBERECHNUNG beim Rendern
    schlaegt fehl. Wer eine exakte Vorschau inkl. korrekter VMA-Spalte braucht, sollte die
    .xlsx stattdessen einmal in echtem Excel oeffnen und von dort als PDF exportieren."""
    result = subprocess.run(
        ['soffice', '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', out_dir, xlsx_path],
        capture_output=True, text=True, timeout=90,
    )
    if result.returncode != 0:
        raise RuntimeError(f'LibreOffice-Konvertierung fehlgeschlagen: {result.stderr}')
    pdf_path = Path(out_dir) / (Path(xlsx_path).stem + '.pdf')
    if not pdf_path.exists():
        raise RuntimeError(f'Erwartete PDF-Datei {pdf_path} wurde nicht erzeugt')
    return str(pdf_path)


def merge(xlsx_path: str, data_path: str, manifest_path: str, output_path: str) -> dict:
    with open(data_path, encoding='utf-8') as f:
        data = json.load(f)
    with open(manifest_path, encoding='utf-8') as f:
        manifest = json.load(f)
    manifest_dir = Path(manifest_path).resolve().parent

    zeilen = entries_to_zeilen(data['days'])
    # rid -> receiptIds je Zeile, in derselben Reihenfolge wie die exportierten Zeilen
    entries_by_date = {d['date']: d['entry'] for d in data['days'] if d.get('exists')}

    report = {'zeilen_ohne_beleg': [], 'fehlende_belege': [], 'eingebundene_belege': []}

    with tempfile.TemporaryDirectory() as tmp:
        sheet_pdf = xlsx_to_pdf(xlsx_path, tmp)

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
    p.add_argument('--xlsx', required=True)
    p.add_argument('--data', required=True)
    p.add_argument('--manifest', required=True)
    p.add_argument('--output', required=True)
    args = p.parse_args()

    report = merge(args.xlsx, args.data, args.manifest, args.output)

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
