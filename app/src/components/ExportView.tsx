import { useState } from 'react';
import { MONATSNAMEN } from '../core/constants';
import { daysInMonth, fmtEUR, istVergangenheit, pad } from '../core/formatters';
import { dateKey, defaultTyp } from '../core/holidays';
import { entriesToZeilen, summe } from '../lib/export/exportZeilen';
import { fehltArbeitszeit } from '../core/entry';
import { SpesenPreviewTable } from './SpesenPreviewTable';
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
        showToast('Export heruntergeladen (.zip mit allen 4 Dateien)');
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
      <SpesenPreviewTable zeilen={zeilen} />
      <div className="export-note" style={{ marginTop: 16 }}>
        Ein Download mit allen vier Dateien dieses Monats: die ausgefüllte Spesenabrechnung
        (.xlsx), alle Belege als ein zusammenhängendes PDF, die Arbeitszeiten-Übersicht
        (.xlsx), und ein Rohdaten-Backup (.json, alle Einträge + Belege dieses Monats als
        Sicherungskopie) - jeweils frisch mit den aktuellen Monatsdaten befüllt.
      </div>
      <button className="export-download" id="downloadZipBtn" onClick={handleZipDownload} disabled={erstelltZip}>
        {erstelltZip ? 'Wird erstellt…' : 'Export herunterladen (.zip)'}
      </button>
    </div>
  );
}
