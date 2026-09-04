const { log, sleep } = require('../utils');

/** Öffnet die Export-Ansicht, prüft die Tabelle und den ZIP-Download-Mechanismus (die drei
 * Einzel-Exporte wurden am 04.09.2026 durch einen gemeinsamen .zip-Download ersetzt - dieser
 * Schritt testet den Klick/Download in einem echten Browser, die eigentlichen Datei-Inhalte
 * sind bereits in zipExport.test.ts/xlsxExport.test.ts/receiptMerge.test.ts/
 * arbeitszeitExport.test.ts als Unit-Tests abgedeckt). */
async function checkExportFlow(page) {
  const results = {};

  await page.click('#exportBtn');
  await page.waitForSelector('.export-view', { timeout: 5000 });
  const exportRows = await page.locator('.export-table tbody tr').count();
  results.exportShowsEntry = exportRows >= 1;
  log(`Export zeigt mindestens 1 Zeile: ${results.exportShowsEntry} (${exportRows} Zeilen)`);

  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }), // Zip baut 3 Dateien - braucht laenger als ein einzelner Download
      page.click('#downloadZipBtn'),
    ]);
    const suggested = download.suggestedFilename();
    results.exportDownloadTriggered = /_Export-Raoul\.zip$/.test(suggested);
    log(`Export-Download ausgelöst: ${results.exportDownloadTriggered} (Dateiname: ${suggested})`);
  } catch (e) {
    results.exportDownloadTriggered = false;
    log(`⚠ Export-Download-Test fehlgeschlagen: ${e.message}`);
  }

  await page.click('#backBtn').catch(() => {});
  await sleep(500);

  return results;
}

module.exports = { checkExportFlow };
