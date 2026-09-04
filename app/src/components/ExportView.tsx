import { useState } from 'react';
import { MONATSNAMEN } from '../core/constants';
import { fmtEUR } from '../core/formatters';
import { entriesToZeilen, summe } from '../lib/exportZeilen';
import type { TagesEintrag } from '../core/types';
import type { KVStore } from '../store/types';

const NAME_STORAGE_KEY = 'spesenabrechnung-name';

interface ExportViewProps {
  year: number;
  month: number;
  entries: Record<string, TagesEintrag>;
  store: KVStore | null;
  onBack: () => void;
  showToast: (msg: string) => void;
}

export function ExportView({ year, month, entries, store, onBack, showToast }: ExportViewProps) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_STORAGE_KEY) || '');
  const [erstelltXlsx, setErstelltXlsx] = useState(false);
  const [erstelltPdf, setErstelltPdf] = useState(false);

  const zeilen = entriesToZeilen(year, month, entries);
  const gesamt = zeilen.reduce((s, z) => s + summe(z), 0);

  function speichereName(wert: string) {
    setName(wert);
    localStorage.setItem(NAME_STORAGE_KEY, wert);
  }

  async function handleXlsxDownload() {
    if (!name.trim()) {
      showToast('Bitte zuerst den Namen eingeben');
      return;
    }
    setErstelltXlsx(true);
    try {
      const { buildFilledXlsx, downloadXlsx } = await import('../lib/xlsxExport');
      const { blob } = await buildFilledXlsx(name.trim(), year, month, entries);
      downloadXlsx(blob, year, month, name.trim());
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
    if (!name.trim()) {
      showToast('Bitte zuerst den Namen eingeben');
      return;
    }
    setErstelltPdf(true);
    try {
      const { buildMergedReceiptsPdf, downloadPdf } = await import('../lib/receiptMerge');
      const { blob, bericht } = await buildMergedReceiptsPdf(store, year, month, entries);
      downloadPdf(blob, year, month, name.trim());
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
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="f_name">Name für die Spesenabrechnung</label>
            <input
              id="f_name" type="text" value={name}
              onChange={(e) => speichereName(e.target.value)}
              placeholder="Vor- und Nachname"
            />
          </div>
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
    </div>
  );
}
