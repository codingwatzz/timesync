import { fmtEUR } from '../core/formatters';
import { summe } from '../lib/export/exportZeilen';
import type { ExportZeile } from '../lib/export/exportZeilen';

const th = 'border-b border-border px-1.5 py-1.5 text-left text-[9px] font-semibold uppercase text-text-muted';
const td = 'border-b border-border px-1.5 py-1.5 font-mono text-text';

/** Reine Anzeige-Tabelle für kosten-/reiserelevante Tage - keine Export-/Download-Logik hier
 * (die lebt in ExportView.tsx). Wird sowohl vom Export-Bildschirm als auch von der
 * ausklappbaren Vorschau direkt in der Monatsansicht verwendet - eine Tabelle, zwei Orte. */
export function SpesenPreviewTable({ zeilen }: { zeilen: ExportZeile[] }) {
  const gesamtKm = zeilen.reduce((s, z) => s + (z.km ?? 0), 0);
  const gesamtEur = zeilen.reduce((s, z) => s + summe(z), 0);

  return (
    <table className="export-table w-full border-collapse text-[12px]">
      <thead><tr><th className={th}>Datum</th><th className={th}>Beschreibung</th><th className={th}>km</th><th className={th}>€</th></tr></thead>
      <tbody>
        {zeilen.length === 0 ? (
          <tr><td colSpan={4} className={`${td} font-sans text-text-muted`}>Keine kosten-/reiserelevanten Tage in diesem Monat.</td></tr>
        ) : (
          zeilen.map((z) => (
            <tr key={z.datum.toISOString()}>
              <td className={td}>{String(z.datum.getDate()).padStart(2, '0')}.{String(z.datum.getMonth() + 1).padStart(2, '0')}.</td>
              <td
                className={`${td} max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap font-sans landscape:max-w-[280px]`}
                title={z.beschreibung || undefined}
              >
                {z.beschreibung || '–'}
              </td>
              <td className={td}>{z.km || '–'}</td>
              <td className={td}>{fmtEUR(summe(z))}</td>
            </tr>
          ))
        )}
      </tbody>
      {zeilen.length > 0 && (
        <tfoot>
          <tr className="arbeitszeit-gesamt bg-primary-soft/40">
            <td colSpan={2} className={`${td} border-t-2 border-border font-sans font-bold`}>GESAMT</td>
            <td className={`${td} border-t-2 border-border font-bold`}>{gesamtKm > 0 ? gesamtKm : '–'}</td>
            <td className={`${td} border-t-2 border-border font-bold`}>{fmtEUR(gesamtEur)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
