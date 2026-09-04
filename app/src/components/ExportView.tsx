import { useState } from 'react';
import { MONATSNAMEN } from '../core/constants';
import { daysInMonth, fmtEUR, istVergangenheit, pad } from '../core/formatters';
import { dateKey, defaultTyp } from '../core/holidays';
import { entriesToZeilen, summe } from '../lib/export/exportZeilen';
import { fehltArbeitszeit } from '../core/entry';
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

  // Vergangene Arbeitstage ohne erfasste Arbeitszeit dieses Monats - unabhängig von der
  // kosten-/reiserelevanten Zeilenauswahl oben (andere Kriterien: dort geht es um Kosten für
  // die Spesenabrechnung, hier um vergessene Arbeitszeiterfassung).
  const n = daysInMonth(year, month);
  const fehlendeTage: string[] = [];
  for (let d = 1; d <= n; d++) {
    const key = dateKey(year, month, d);
    const e = entries[key];
    const typ = e ? e.typ : defaultTyp(year, month, d);
    if (istVergangenheit(year, month, d) && fehltArbeitszeit(e, typ)) {
      fehlendeTage.push(`${pad(d)}.${pad(month)}.`);
    }
  }

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
      {fehlendeTage.length > 0 && (
        <div className="warn-banner" id="missingWorkTimeWarn">
          ⚠ {fehlendeTage.length} Arbeitstag{fehlendeTage.length !== 1 ? 'e' : ''} ohne erfasste
          Arbeitszeit: {fehlendeTage.join(', ')}
        </div>
      )}
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
