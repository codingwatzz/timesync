#!/usr/bin/env python3
"""
Erzeugt die Spesenabrechnungs-Übersichtsseite (Seite 1 des Gesamt-PDFs) direkt als PDF via
reportlab - OHNE den Umweg über das Rendern der .xlsx durch LibreOffice.

WARUM (03.09.2026): LibreOffice verliert beim Konvertieren dieser .xltx-Vorlage zu PDF
Tabellenrahmen und zeigt "#NAME?" in der VERPFLEGUNGSMEHRAUFWAND-Spalte (die `_xlfn.LET`-
Formel kann LibreOffice nicht auswerten). Test mit der komplett UNVERÄNDERTEN Original-
Vorlage (keine einzige Zelle von uns bearbeitet) zeigt dieselben Probleme - das ist also
keine Folge unserer Datenbearbeitung, sondern eine grundsätzliche Rendering-Einschränkung
von LibreOffice für diese Vorlage. Da wir die korrekten Werte ohnehin bereits in Python
berechnen (siehe export_xlsx.py::ExportZeile), umgehen wir das Problem komplett, indem wir
die Übersichtsseite selbst sauber bauen, statt uns auf die Treue der xlsx-Wiedergabe zu
verlassen.
"""
from __future__ import annotations

from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT

BLAU = colors.HexColor('#2E75B6')
GRAU_HELL = colors.HexColor('#F2F2F2')


def eur(wert: float) -> str:
    if not wert:
        return '€ -'
    return '€ ' + f'{wert:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def render_summary_pdf(output_path: str, name: str, jahr: int, monat: int, zeilen: list) -> None:
    """zeilen: Liste von ExportZeile-Objekten (siehe export_xlsx.py)."""
    von = date(jahr, monat, 1)
    bis_naechster = date(jahr, monat + 1, 1) if monat < 12 else date(jahr + 1, 1, 1)
    bis = date.fromordinal(bis_naechster.toordinal() - 1)

    doc = SimpleDocTemplate(
        output_path, pagesize=landscape(A4),
        leftMargin=10 * mm, rightMargin=10 * mm, topMargin=12 * mm, bottomMargin=12 * mm,
    )
    styles = getSampleStyleSheet()
    titel_stil = ParagraphStyle('Titel', parent=styles['Heading1'], fontSize=18, spaceAfter=2)
    klein_stil = ParagraphStyle('Klein', parent=styles['Normal'], fontSize=8, textColor=colors.grey)
    zelle_stil = ParagraphStyle('Zelle', parent=styles['Normal'], fontSize=8, leading=10, alignment=TA_LEFT)

    elemente = []
    elemente.append(Paragraph('SPESENABRECHNUNG', titel_stil))
    elemente.append(Paragraph('sqior medical GmbH', klein_stil))
    elemente.append(Paragraph('Hopfenstraße 8, 80335 München', klein_stil))
    elemente.append(Spacer(1, 8))

    kopf_tabelle = Table(
        [['Name', name, '', 'von', von.strftime('%d.%m.%Y')],
         ['', '', '', 'bis', bis.strftime('%d.%m.%Y')]],
        colWidths=[20 * mm, 60 * mm, 100 * mm, 12 * mm, 30 * mm],
    )
    kopf_tabelle.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (1, 0), (1, 1), GRAU_HELL),
        ('BACKGROUND', (4, 0), (4, 1), GRAU_HELL),
    ]))
    elemente.append(kopf_tabelle)
    elemente.append(Spacer(1, 10))

    header_stil = ParagraphStyle('Header', parent=styles['Normal'], fontSize=6, leading=7.5,
                                  textColor=colors.white, fontName='Helvetica-Bold')

    def hdr(text: str):
        return Paragraph(text, header_stil)

    haupt_header = [hdr('DATUM'), hdr('BESCHREIBUNG (Anlass, Details)'), hdr('HOTEL'), hdr('TRANSPORT'),
                     hdr('BEWIRTUNG'), hdr('GEFAHRENE<br/>KM'), hdr('KM-PAUSCHALE<br/>(km x 0,30 €)'),
                     hdr('VERPFLEGUNGS-<br/>MEHRAUFWAND'), hdr('SONSTIGES'), hdr('SUMME')]
    neben_header = [hdr('REISELAND'), hdr('ART DES<br/>REISETAGES'), hdr('FRÜHST.'), hdr('MITTAG'), hdr('ABEND')]

    haupt_rows = [haupt_header]
    neben_rows = [neben_header]
    for z in zeilen:
        haupt_rows.append([
            z.datum.strftime('%d.%m.%Y'),
            Paragraph(z.beschreibung, zelle_stil),
            eur(z.hotel), eur(z.transport), eur(z.bewirtung),
            str(int(z.km)) if z.km else '',
            eur(z.km_pauschale), eur(z.vma), eur(z.sonstiges), eur(z.summe),
        ])
        if z.reiseart is not None:
            neben_rows.append([z.reiseland, Paragraph(z.reiseart, zelle_stil),
                                'Ja' if z.fr else 'Nein', 'Ja' if z.mi else 'Nein', 'Ja' if z.ab else 'Nein'])
        else:
            neben_rows.append([z.reiseland, '', '', '', ''])

    gesamt = {k: sum(getattr(z, k) for z in zeilen) for k in
              ['hotel', 'transport', 'bewirtung', 'km_pauschale', 'vma', 'sonstiges', 'summe']}
    haupt_rows.append(['SUMMEN', '', eur(gesamt['hotel']), eur(gesamt['transport']), eur(gesamt['bewirtung']),
                        '', eur(gesamt['km_pauschale']), eur(gesamt['vma']), eur(gesamt['sonstiges']), eur(gesamt['summe'])])
    neben_rows.append(['', '', '', '', ''])

    haupt_breiten = [18 * mm, 40 * mm, 15 * mm, 16 * mm, 15 * mm, 16 * mm, 20 * mm, 20 * mm, 15 * mm, 14 * mm]
    haupt_tabelle = Table(haupt_rows, colWidths=haupt_breiten, repeatRows=1)
    letzte = len(haupt_rows) - 1
    haupt_tabelle.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BLAU),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, 0), 7),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BACKGROUND', (0, letzte), (-1, letzte), BLAU),
        ('TEXTCOLOR', (0, letzte), (-1, letzte), colors.white),
        ('FONTNAME', (0, letzte), (-1, letzte), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, 0), 2),
        ('RIGHTPADDING', (0, 0), (-1, 0), 2),
    ]))

    neben_breiten = [20 * mm, 26 * mm, 12 * mm, 12 * mm, 12 * mm]
    neben_tabelle = Table(neben_rows, colWidths=neben_breiten, repeatRows=1)
    neben_tabelle.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BLAU),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, 0), 7),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, 0), 2),
        ('RIGHTPADDING', (0, 0), (-1, 0), 2),
    ]))

    aussen_tabelle = Table([[haupt_tabelle, neben_tabelle]], colWidths=[sum(haupt_breiten) + 4 * mm, sum(neben_breiten)])
    aussen_tabelle.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    elemente.append(aussen_tabelle)
    elemente.append(Spacer(1, 16))

    unterschrift_tabelle = Table([['Ort, Datum', '', 'Unterschrift Mitarbeiter']],
                                  colWidths=[60 * mm, 20 * mm, 60 * mm])
    unterschrift_tabelle.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (0, 0), 0.5, colors.black),
        ('LINEABOVE', (2, 0), (2, 0), 0.5, colors.black),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
    ]))
    elemente.append(unterschrift_tabelle)

    doc.build(elemente)
