import { MONATSNAMEN } from '../core/constants';
import { fmtEUR } from '../core/formatters';
import { tagesKosten } from '../core/entry';
import type { ExportZeile } from '../core/types';

interface ExportViewProps {
  year: number;
  month: number;
  rows: ExportZeile[];
  receiptCount: number;
  onBack: () => void;
  onDownload: () => void;
}

export function ExportView({ year, month, rows, receiptCount, onBack, onDownload }: ExportViewProps) {
  const totalSum = rows.reduce((s, r) => s + tagesKosten(r), 0);

  return (
    <div className="export-view">
      <button className="back-link" id="backBtn" onClick={onBack}>← Zurück</button>
      <h2>Export {MONATSNAMEN[month - 1]} {year}</h2>
      <div className="sheet-sub">
        {rows.length} Tage vor Ort · {receiptCount} Beleg{receiptCount !== 1 ? 'e' : ''} · {fmtEUR(totalSum)} € Kosten gesamt
      </div>
      <table className="export-table">
        <thead><tr><th>Datum</th><th>Beschreibung</th><th>km</th><th>€</th><th>Beleg</th></tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} style={{ fontFamily: 'inherit', color: 'var(--grey)' }}>Keine Vor-Ort-Tage in diesem Monat.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.date}>
                <td>{r.date.slice(8, 10)}.{r.date.slice(5, 7)}.</td>
                <td style={{ fontFamily: 'inherit', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.beschreibung || '–'}
                </td>
                <td>{r.km || '–'}</td>
                <td>{fmtEUR(tagesKosten(r))}</td>
                <td>{r.receipts?.length || '–'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {rows.length > 0 && (
        <>
          <div className="export-note">
            Der Export enthält alle Zeiterfassungs-Daten und Belege dieses Monats als eine Datei.
            Lade diese Datei im Claude-Chat hoch, damit deine Spesenabrechnung.xlsx automatisch befüllt wird.
          </div>
          <button className="export-download" id="downloadBtn" onClick={onDownload}>
            Exportdatei herunterladen (.json)
          </button>
        </>
      )}
    </div>
  );
}
