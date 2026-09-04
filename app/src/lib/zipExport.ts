// Bündelt die drei Monats-Exportdateien (Spesenabrechnung, Belege, Arbeitszeiten) in ein
// einziges .zip - ein Download statt drei. Nutzt JSZip, das ohnehin schon fürs xlsx-Patching
// (siehe xlsxExport.ts) im Bundle steckt.

import JSZip from 'jszip';
import type { TagesEintrag } from '../core/types';
import type { KVStore } from '../store/types';
import { SPESEN_NAME_DATEI } from '../core/constants';
import { pad } from '../core/formatters';
import { triggerDownload } from './download';
import type { BelegMergeBericht } from './receiptMerge';

export interface ExportZipErgebnis {
  blob: Blob;
  belegeBericht: BelegMergeBericht;
}

/** Baut alle drei Exportdateien parallel und packt sie in ein .zip. Die drei Bausteine sind
 * unabhängig voneinander (jeder bereits einzeln getestet in xlsxExport.test.ts,
 * receiptMerge.test.ts, arbeitszeitExport.test.ts) - dieses Modul fügt sie nur zusammen,
 * ohne eigene Geschäftslogik. */
export async function buildExportZip(
  year: number, month: number, entries: Record<string, TagesEintrag>, store: KVStore,
): Promise<ExportZipErgebnis> {
  const [{ buildFilledXlsx }, { buildMergedReceiptsPdf }, { buildArbeitszeitXlsx }] = await Promise.all([
    import('./xlsxExport'),
    import('./receiptMerge'),
    import('./arbeitszeitExport'),
  ]);

  const [spesenErgebnis, belegeErgebnis, arbeitszeitBlob] = await Promise.all([
    buildFilledXlsx(year, month, entries),
    buildMergedReceiptsPdf(store, year, month, entries),
    buildArbeitszeitXlsx(year, month, entries),
  ]);

  const praefix = `${year}-${pad(month)}`;
  const zip = new JSZip();
  zip.file(`${praefix}_Spesenabrechnung-${SPESEN_NAME_DATEI}.xlsx`, await spesenErgebnis.blob.arrayBuffer());
  zip.file(`${praefix}_Belege-Spesenabrechnung-${SPESEN_NAME_DATEI}.pdf`, await belegeErgebnis.blob.arrayBuffer());
  zip.file(`${praefix}_Arbeitszeiten-${SPESEN_NAME_DATEI}.xlsx`, await arbeitszeitBlob.arrayBuffer());

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, belegeBericht: belegeErgebnis.bericht };
}

export function downloadExportZip(blob: Blob, year: number, month: number): void {
  triggerDownload(blob, `${year}-${pad(month)}_Export-${SPESEN_NAME_DATEI}.zip`);
}
