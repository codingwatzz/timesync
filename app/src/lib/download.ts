// Gemeinsamer Download-Helfer für alle Export-Module. Vorher hatte fast jedes Export-Modul
// (xlsxExport.ts, receiptMerge.ts, arbeitszeitExport.ts, zipExport.ts) eine eigene,
// identische Kopie dieser Logik - hier einmal zentral, DOM-Zugriff ist der Grund, warum das
// NICHT in core/formatters.ts liegt (core/ ist bewusst 0-DOM-Abhängigkeit, siehe
// PROJEKT_UEBERSICHT.md).

export function triggerDownload(blob: Blob, dateiname: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
