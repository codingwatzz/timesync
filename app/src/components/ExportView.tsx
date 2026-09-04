import { useState } from 'react';
import { MONATSNAMEN } from '../core/constants';
import { fmtEUR } from '../core/formatters';
import { entriesToZeilen, summe } from '../lib/export/exportZeilen';
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
  const [erstelltZip, setErstelltZip] = useState(false);

  const zeilen = entriesToZeilen(year, month, entries);
  const gesamt = zeilen.reduce((s, z) => s + summe(z), 0);

  async function handleZipDownload() {
    if (!store) {
      showToast('Speicher nicht verfügbar');
      return;
    }
    setErstelltZip(true);
    try {
      const { buildExportZip, downloadExportZip } = await import('../lib/export/zipExport');
      const { blob, belegeBericht } = await buildExportZip(year, month, entries, store);
      downloadExportZip(blob, year, month);
      if (belegeBericht.fehlendeBelege.length > 0) {
        showToast(`Export heruntergeladen, aber ${belegeBericht.fehlendeBelege.length} Beleg(e) fehlten`);
      } else {
        showToast('Export heruntergeladen (.zip mit allen 3 Dateien)');
      }
    } catch (err) {
      showToast(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setErstelltZip(false);
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
      <div className="export-note" style={{ marginTop: 16 }}>
        Ein Download mit allen drei Dateien dieses Monats: die ausgefüllte Spesenabrechnung
        (.xlsx), alle Belege als ein zusammenhängendes PDF, und die Arbeitszeiten-Übersicht
        (.xlsx) - jeweils frisch mit den aktuellen Monatsdaten befüllt.
      </div>
      <button className="export-download" id="downloadZipBtn" onClick={handleZipDownload} disabled={erstelltZip}>
        {erstelltZip ? 'Wird erstellt…' : 'Export herunterladen (.zip)'}
      </button>
    </div>
  );
}
