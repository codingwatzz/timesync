import { useState } from 'react';
import { ArrowLeft, AlertTriangle, Download, Loader2 } from 'lucide-react';
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
    <div className="export-view px-4 pb-10 pt-4">
      <button
        className="mb-1.5 flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary-strong"
        id="backBtn"
        onClick={onBack}
      >
        <ArrowLeft size={15} strokeWidth={2.25} /> Zurück
      </button>
      <h2 className="m-0 text-[18px] font-bold text-text">Export {MONATSNAMEN[month - 1]} {year}</h2>
      <div className="mt-1 text-xs text-text-muted">
        {zeilen.length} Zeile{zeilen.length !== 1 ? 'n' : ''} · {fmtEUR(gesamt)} € Kosten gesamt
      </div>
      {fehlendeTage.length > 0 && (
        <div
          id="missingWorkTimeWarn"
          className="mt-3.5 flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs font-semibold text-warning"
        >
          <AlertTriangle size={15} className="flex-shrink-0" strokeWidth={2.25} />
          {fehlendeTage.length} Arbeitstag{fehlendeTage.length !== 1 ? 'e' : ''} ohne erfasste
          Arbeitszeit: {fehlendeTage.join(', ')}
        </div>
      )}
      <div className="mt-3.5 overflow-x-auto rounded-lg border border-border bg-surface p-2.5">
        <SpesenPreviewTable zeilen={zeilen} />
      </div>
      <div className="mt-4 rounded-lg border border-primary/30 bg-primary-soft px-3 py-2.5 text-xs leading-relaxed text-text">
        Ein Download mit allen vier Dateien dieses Monats: die ausgefüllte Spesenabrechnung
        (.xlsx), alle Belege als ein zusammenhängendes PDF, die Arbeitszeiten-Übersicht
        (.xlsx), und ein Rohdaten-Backup (.json, alle Einträge + Belege dieses Monats als
        Sicherungskopie) - jeweils frisch mit den aktuellen Monatsdaten befüllt.
      </div>
      <button
        className="mt-4.5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3.5 text-[15px] font-bold text-text-on-accent shadow-[0_6px_20px_-4px_rgba(99,102,241,0.4)] transition-colors hover:bg-primary-strong disabled:opacity-60"
        id="downloadZipBtn"
        onClick={handleZipDownload}
        disabled={erstelltZip}
      >
        {erstelltZip ? (
          <><Loader2 size={16} className="animate-spin" strokeWidth={2.25} /> Wird erstellt…</>
        ) : (
          <><Download size={16} strokeWidth={2.25} /> Export herunterladen (.zip)</>
        )}
      </button>
    </div>
  );
}
