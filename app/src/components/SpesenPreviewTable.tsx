import { fmtEUR } from '../core/formatters';
import { summe } from '../lib/export/exportZeilen';
import type { ExportZeile } from '../lib/export/exportZeilen';

/** Reine Anzeige-Tabelle für kosten-/reiserelevante Tage - keine Export-/Download-Logik hier
 * (die lebt in ExportView.tsx). Wird sowohl vom Export-Bildschirm als auch von der
 * ausklappbaren Vorschau direkt in der Monatsansicht verwendet - eine Tabelle, zwei Orte. */
export function SpesenPreviewTable({ zeilen }: { zeilen: ExportZeile[] }) {
  const gesamtKm = zeilen.reduce((s, z) => s + (z.km ?? 0), 0);
  const gesamtEur = zeilen.reduce((s, z) => s + summe(z), 0);

  return (
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
      {zeilen.length > 0 && (
        <tfoot>
          <tr className="arbeitszeit-gesamt">
            <td colSpan={2}>GESAMT</td>
            <td>{gesamtKm > 0 ? gesamtKm : '–'}</td>
            <td>{fmtEUR(gesamtEur)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
