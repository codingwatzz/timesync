import { WOCHENTAGE, TYP_LABEL } from '../core/constants';
import { fmtHHMM, fmtHHMMSigned, pad } from '../core/formatters';
import type { ArbeitszeitBerechnung } from '../core/arbeitszeit';

/** Reine Anzeige-Tabelle der Arbeitszeiten-Berechnung - dieselbe Datenquelle
 * (core/arbeitszeit.ts::berechneArbeitszeit) wie der .xlsx-Export, hier nur als HTML-Tabelle
 * statt als Excel-Datei gerendert. */
export function ArbeitszeitPreviewTable({ berechnung: b }: { berechnung: ArbeitszeitBerechnung }) {
  return (
    <>
      <table className="export-table">
        <thead><tr><th>Datum</th><th>Typ</th><th>IST</th><th>SOLL</th><th>EXTRA</th></tr></thead>
        <tbody>
          {b.zeilen.map((z, i) => {
            if (z.art === 'leerzeile') return <tr key={i} className="arbeitszeit-leerzeile"><td colSpan={5} /></tr>;
            if (z.art === 'wochensumme') {
              return (
                <tr key={i} className="arbeitszeit-wochensumme">
                  <td colSpan={2}>Wochensumme</td>
                  <td>{fmtHHMM(z.ist)}</td>
                  <td>{fmtHHMM(z.soll)}</td>
                  <td className={z.extra > 0 ? 'plus' : z.extra < 0 ? 'minus' : ''}>{fmtHHMMSigned(z.extra)}</td>
                </tr>
              );
            }
            return (
              <tr key={i}>
                <td>{pad(z.datum.getDate())}.{pad(z.datum.getMonth() + 1)}. {WOCHENTAGE[z.datum.getDay()]}</td>
                <td>{TYP_LABEL[z.typ]}{z.typ === 'A' && z.ho ? ' (HO)' : ''}</td>
                <td>{fmtHHMM(z.ist)}</td>
                <td>{fmtHHMM(z.soll)}</td>
                <td className={z.extra > 0 ? 'plus' : z.extra < 0 ? 'minus' : ''}>{fmtHHMMSigned(z.extra)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="arbeitszeit-gesamt">
            <td colSpan={2}>GESAMT</td>
            <td>{fmtHHMM(b.gesamtIst)}</td>
            <td>{fmtHHMM(b.gesamtSoll)}</td>
            <td className={b.gesamtExtra > 0 ? 'plus' : b.gesamtExtra < 0 ? 'minus' : ''}>
              {fmtHHMMSigned(b.gesamtExtra)} ({b.gesamtProzent >= 0 ? '+' : ''}{b.gesamtProzent.toFixed(1)}%)
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="sheet-sub" style={{ marginTop: 10 }}>
        Homeoffice-Quote: {Math.round(b.homeofficeQuote * 100)}%
        ({b.homeofficeTage} von {b.arbeitstageGesamt} Arbeitstagen)
        · Urlaub: {b.gesamtProTyp.U} · Krank: {b.gesamtProTyp.K} · Gleitfrei: {b.gesamtProTyp.G}
      </div>
    </>
  );
}
