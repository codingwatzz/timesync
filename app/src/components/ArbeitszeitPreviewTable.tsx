import { WOCHENTAGE, TYP_LABEL } from '../core/constants';
import { fmtHHMM, fmtHHMMSigned, pad } from '../core/formatters';
import type { ArbeitszeitBerechnung } from '../core/arbeitszeit';

const th = 'border-b border-border px-1.5 py-1.5 text-left text-[9px] font-semibold uppercase text-text-muted';
const td = 'border-b border-border px-1.5 py-1.5 font-mono text-text';

/** Reine Anzeige-Tabelle der Arbeitszeiten-Berechnung - dieselbe Datenquelle
 * (core/arbeitszeit.ts::berechneArbeitszeit) wie der .xlsx-Export, hier nur als HTML-Tabelle
 * statt als Excel-Datei gerendert. */
export function ArbeitszeitPreviewTable({ berechnung: b }: { berechnung: ArbeitszeitBerechnung }) {
  return (
    <>
      <table className="export-table w-full border-collapse text-[12px]">
        <thead><tr><th className={th}>Datum</th><th className={th}>Typ</th><th className={th}>IST</th><th className={th}>SOLL</th><th className={th}>EXTRA</th></tr></thead>
        <tbody>
          {b.zeilen.map((z, i) => {
            if (z.art === 'leerzeile') return <tr key={i} className="arbeitszeit-leerzeile"><td colSpan={5} className="p-0.5" /></tr>;
            if (z.art === 'wochensumme') {
              return (
                <tr key={i} className="arbeitszeit-wochensumme bg-secondary-soft/40">
                  <td colSpan={2} className={`${td} font-sans font-bold`}>Wochensumme</td>
                  <td className={`${td} font-bold`}>{fmtHHMM(z.ist)}</td>
                  <td className={`${td} font-bold`}>{fmtHHMM(z.soll)}</td>
                  <td className={`${td} font-bold ${z.extra > 0 ? 'text-success' : z.extra < 0 ? 'text-danger' : ''}`}>{fmtHHMMSigned(z.extra)}</td>
                </tr>
              );
            }
            return (
              <tr key={i}>
                <td className={`${td} font-sans`}>{pad(z.datum.getDate())}.{pad(z.datum.getMonth() + 1)}. {WOCHENTAGE[z.datum.getDay()]}</td>
                <td className={`${td} font-sans`}>{TYP_LABEL[z.typ]}{z.typ === 'A' && z.ho ? ' (HO)' : ''}</td>
                <td className={td}>{fmtHHMM(z.ist)}</td>
                <td className={td}>{fmtHHMM(z.soll)}</td>
                <td className={`${td} ${z.extra > 0 ? 'text-success' : z.extra < 0 ? 'text-danger' : ''}`}>{fmtHHMMSigned(z.extra)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="arbeitszeit-gesamt bg-primary-soft/40">
            <td colSpan={2} className={`${td} border-t-2 border-border font-sans font-bold`}>GESAMT</td>
            <td className={`${td} border-t-2 border-border font-bold`}>{fmtHHMM(b.gesamtIst)}</td>
            <td className={`${td} border-t-2 border-border font-bold`}>{fmtHHMM(b.gesamtSoll)}</td>
            <td className={`${td} border-t-2 border-border font-bold ${b.gesamtExtra > 0 ? 'text-success' : b.gesamtExtra < 0 ? 'text-danger' : ''}`}>
              {fmtHHMMSigned(b.gesamtExtra)} ({b.gesamtProzent >= 0 ? '+' : ''}{b.gesamtProzent.toFixed(1)}%)
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-2.5 text-xs text-text-muted">
        Homeoffice-Quote: {Math.round(b.homeofficeQuote * 100)}%
        ({b.homeofficeTage} von {b.arbeitstageGesamt} Arbeitstagen)
        · Urlaub: {b.gesamtProTyp.U} · Krank: {b.gesamtProTyp.K} · Gleitfrei: {b.gesamtProTyp.G}
      </div>
    </>
  );
}
