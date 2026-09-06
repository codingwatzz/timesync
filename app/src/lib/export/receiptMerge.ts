// Führt alle Beleg-PDFs eines Monats zu einem einzigen, zusammenhängenden PDF zusammen -
// komplett im Browser (pdf-lib), kein Server nötig. Reihenfolge: nach Datum aufsteigend,
// wie die Zeilen der Spesenabrechnung - so kann der Prüfende Zeile für Zeile mitgehen.
//
// Fotos werden bereits bei der Aufnahme in Graustufen umgewandelt (siehe lib/pdf.ts), hier
// werden nur bereits fertige Beleg-PDFs unverändert aneinandergehängt - kein erneutes
// Bildverarbeiten nötig.

import { PDFDocument } from 'pdf-lib';
import type { KVStore } from '../../store/types';
import type { TagesEintrag } from '../../core/types';
import { loadReceipt } from '../../hooks/entryStorage';
import { dateKey } from '../../core/holidays';
import { daysInMonth, toNumber } from '../../core/formatters';

export interface BelegMergeBericht {
  eingebundeneBelege: { date: string; name: string }[];
  tageOhneBeleg: string[];
  fehlendeBelege: { date: string; rid: string }[];
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Baut ein zusammenhängendes PDF aus allen Belegen eines Monats, die zu Kosten-/Reiseart-
 * relevanten Tagen gehören (dieselbe Auswahl wie beim xlsx-Export) - in Datumsreihenfolge. */
export async function buildMergedReceiptsPdf(
  store: KVStore, year: number, month: number, entries: Record<string, TagesEintrag>,
): Promise<{ blob: Blob; bericht: BelegMergeBericht }> {
  const bericht: BelegMergeBericht = { eingebundeneBelege: [], tageOhneBeleg: [], fehlendeBelege: [] };
  const zusammengefuehrt = await PDFDocument.create();

  const n = daysInMonth(year, month);
  for (let d = 1; d <= n; d++) {
    const key = dateKey(year, month, d);
    const e = entries[key];
    if (!e) continue;
    // Komma-sicheren zentralen Parser nutzen statt eigenem parseFloat() (siehe UX-Review
    // 06.09.2026, Punkt 4.2 - das war die DRITTE unabhängige, komma-unsichere Zahl-Parser-
    // Kopie im Projekt, siehe core/formatters.ts::toNumber()).
    const kosten = (['km', 'transport', 'hotel', 'bewirtung', 'sonstiges'] as const)
      .some((f) => toNumber((e as unknown as Record<string, string>)[f]) > 0);
    if (!kosten && !e.reiseart) continue;

    if (e.receiptIds.length === 0) {
      bericht.tageOhneBeleg.push(key);
      continue;
    }
    for (const rid of e.receiptIds) {
      const meta = await loadReceipt(store, rid);
      if (!meta || !meta.dataUrl) {
        bericht.fehlendeBelege.push({ date: key, rid });
        continue;
      }
      try {
        const belegBytes = dataUrlToBytes(meta.dataUrl);
        const belegPdf = await PDFDocument.load(belegBytes);
        const seiten = await zusammengefuehrt.copyPages(belegPdf, belegPdf.getPageIndices());
        seiten.forEach((seite) => zusammengefuehrt.addPage(seite));
        bericht.eingebundeneBelege.push({ date: key, name: meta.name });
      } catch (err) {
        bericht.fehlendeBelege.push({ date: key, rid });
      }
    }
  }

  const bytes = await zusammengefuehrt.save();
  const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' });
  return { blob, bericht };
}
