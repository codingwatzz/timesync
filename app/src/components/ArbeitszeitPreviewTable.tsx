import { WOCHENTAGE, TYP_LABEL } from '../core/constants';
import { fmtHHMM, fmtHHMMSigned, pad } from '../core/formatters';
import type { ArbeitszeitBerechnung } from '../core/arbeitszeit';

const th = 'border-b border-border px-1.5 py-1.5 text-left text-[9px] font-semibold uppercase text-text-muted';
const td = 'border-b border-border px-1.5 py-1.5 font-mono text-text';
// Variante ohne text-text, nur für die EXTRA-Zellen: text-text UND text-success/text-danger
// als zwei gleichrangige Klassen auf demselben Element führen dazu, dass die im generierten
// CSS zuletzt stehende Regel gewinnt (CSS entscheidet bei gleicher Spezifität nach Regel-
// Reihenfolge im Stylesheet, NICHT nach Klassen-Reihenfolge im class-Attribut) - das war
// bislang text-text, wodurch KEINE der beiden Farben je sichtbar wurde (Nutzer-Meldung
// 29.09.2026: "keine Farben zu sehen", betraf Tages-, Wochensummen- UND GESAMT-Zeile
// gleichermaßen). Fix: für diese Zellen ist immer GENAU EINE Text-Farb-Klasse aktiv
// (nie text-text UND text-success/text-danger gleichzeitig), siehe extraFarbe() unten.
const tdOhneFarbe = td.replace(' text-text', '');

/** Genau eine Textfarb-Klasse für eine EXTRA-Zelle, nie in Kombination mit text-text (siehe
 * Kommentar bei tdOhneFarbe). Neutral (== 0) bleibt bewusst text-text (weiß/Standardfarbe). */
function extraFarbe(extra: number): string {
  if (extra > 0) return 'text-success';
  if (extra < 0) return 'text-danger';
  return 'text-text';
}

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
                  <td className={`${tdOhneFarbe} font-bold ${extraFarbe(z.extra)}`}>
                    {fmtHHMMSigned(z.extra)} ({z.prozent >= 0 ? '+' : ''}{z.prozent.toFixed(1)}%)
                  </td>
                </tr>
              );
            }
            return (
              <tr key={i}>
                <td className={`${td} font-sans`}>{pad(z.datum.getDate())}.{pad(z.datum.getMonth() + 1)}. {WOCHENTAGE[z.datum.getDay()]}</td>
                <td className={`${td} font-sans`}>{TYP_LABEL[z.typ]}{z.typ === 'A' && z.ho ? ' (HO)' : ''}</td>
                <td className={td}>{fmtHHMM(z.ist)}</td>
                <td className={td}>{fmtHHMM(z.soll)}</td>
                <td className={td}>{fmtHHMMSigned(z.extra)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="arbeitszeit-gesamt bg-primary-soft/40">
            <td colSpan={2} className={`${td} border-t-2 border-border font-sans font-bold`}>GESAMT</td>
            <td className={`${td} border-t-2 border-border font-bold`}>{fmtHHMM(b.gesamtIst)}</td>
            <td className={`${td} border-t-2 border-border font-bold`}>{fmtHHMM(b.gesamtSoll)}</td>
            <td className={`${tdOhneFarbe} border-t-2 border-border font-bold ${extraFarbe(b.gesamtExtra)}`}>
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
