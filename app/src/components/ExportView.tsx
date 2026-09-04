import { useState } from 'react';
import { MONATSNAMEN } from '../core/constants';
import { fmtEUR } from '../core/formatters';
import { entriesToZeilen, summe } from '../lib/exportZeilen';
import type { TagesEintrag } from '../core/types';
import type { KVStore } from '../store/types';

interface ExportViewProps {
  year: number;
  month: number;
  entries: Record<string, TagesEintrag>;
  store: KVStore | null;
  onBack: () => void;
  showToast: (msg: string) => void;
}

export function ExportView({ year, month, entries, store, onBack, showToast }: ExportViewProps) {
  const [erstelltXlsx, setErstelltXlsx] = useState(false);
  const [erstelltPdf, setErstelltPdf] = useState(false);
  const [erstelltArbeitszeit, setErstelltArbeitszeit] = useState(false);

  const zeilen = entriesToZeilen(year, month, entries);
  const gesamt = zeilen.reduce((s, z) => s + summe(z), 0);

  async function handleXlsxDownload() {
    setErstelltXlsx(true);
    try {
      const { buildFilledXlsx, downloadXlsx } = await import('../lib/xlsxExport');
      const { blob } = await buildFilledXlsx(year, month, entries);
      downloadXlsx(blob, year, month);
      showToast('Spesenabrechnung heruntergeladen');
    } catch (err) {
      showToast(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setErstelltXlsx(false);
    }
  }

  async function handlePdfDownload() {
    if (!store) {
      showToast('Speicher nicht verfügbar');
      return;
    }
    setErstelltPdf(true);
    try {
      const { buildMergedReceiptsPdf, downloadPdf } = await import('../lib/receiptMerge');
      const { blob, bericht } = await buildMergedReceiptsPdf(store, year, month, entries);
      downloadPdf(blob, year, month);
      if (bericht.fehlendeBelege.length > 0) {
        showToast(`Belege heruntergeladen, aber ${bericht.fehlendeBelege.length} Beleg(e) fehlten`);
      } else {
        showToast(`Belege heruntergeladen (${bericht.eingebundeneBelege.length} Seite${bericht.eingebundeneBelege.length !== 1 ? 'n' : ''})`);
      }
    } catch (err) {
      showToast(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setErstelltPdf(false);
    }
  }

  async function handleArbeitszeitDownload() {
    setErstelltArbeitszeit(true);
    try {
      const { buildArbeitszeitXlsx, downloadArbeitszeitXlsx } = await import('../lib/arbeitszeitExport');
      const blob = await buildArbeitszeitXlsx(year, month, entries);
      downloadArbeitszeitXlsx(blob, year, month);
      showToast('Arbeitszeiten heruntergeladen');
    } catch (err) {
      showToast(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setErstelltArbeitszeit(false);
    }
  }

  return (
    <div className="export-view">
      <button className="back-link" id="backBtn" onClick={onBack}>← Zurück</button>
      <h2>Export {MONATSNAMEN[month - 1]} {year}</h2>
      <div className="sheet-sub">
        {zeilen.length} Zeile{zeilen.length !== 1 ? 'n' : ''} · {fmtEUR(gesamt)} € Kosten gesamt
      </div>
      <table className="export-table">
        <thead><tr><th>Datum</th><th>Beschreibung</th><th>km</th><th>€</th></tr></thead>
        <tbody>
          {zeilen.length === 0 ? (
            <tr><td colSpan={4} style={{ fontFamily: 'inherit', color: 'var(--grey)' }}>Keine kosten-/reiserelevanten Tage in diesem Monat.</td></tr>
          ) : (
            zeilen.map((z) => (
              <tr key={z.datum.toISOString()}>
                <td>{String(z.datum.getDate()).padStart(2, '0')}.{String(z.datum.getMonth() + 1).padStart(2, '0')}.</td>
                <td style={{ fontFamily: 'inherit', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {z.beschreibung || '–'}
                </td>
                <td>{z.km || '–'}</td>
                <td>{fmtEUR(summe(z))}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {zeilen.length > 0 && (
        <>
          <div className="export-note">
            Zwei Dateien zum direkten Einreichen: die ausgefüllte Spesenabrechnung als Excel-Datei
            und alle Belege dieses Monats als ein zusammenhängendes PDF.
          </div>
          <button className="export-download" id="downloadXlsxBtn" onClick={handleXlsxDownload} disabled={erstelltXlsx}>
            {erstelltXlsx ? 'Wird erstellt…' : 'Spesenabrechnung herunterladen (.xlsx)'}
          </button>
          <button className="export-download" id="downloadPdfBtn" onClick={handlePdfDownload} disabled={erstelltPdf} style={{ marginTop: 8 }}>
            {erstelltPdf ? 'Wird erstellt…' : 'Belege herunterladen (.pdf)'}
          </button>
        </>
      )}
      <div className="export-note" style={{ marginTop: 16 }}>
        Übersicht über Start/Ende/Pause, IST/SOLL/EXTRA und Wochensummen für alle Tage dieses
        Monats - nur zur eigenen Kontrolle, nicht zum Einreichen.
      </div>
      <button className="export-download" id="downloadArbeitszeitBtn" onClick={handleArbeitszeitDownload} disabled={erstelltArbeitszeit} style={{ marginTop: 8 }}>
        {erstelltArbeitszeit ? 'Wird erstellt…' : 'Arbeitszeiten herunterladen (.xlsx)'}
      </button>
    </div>
  );
}
