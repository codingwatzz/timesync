const { log, sleep } = require('../utils');

/** Öffnet die Export-Ansicht, prüft die Tabelle und den Download-Mechanismus. */
async function checkExportFlow(page) {
  const results = {};

  await page.click('#exportBtn');
  await page.waitForSelector('.export-view', { timeout: 5000 });
  const exportRows = await page.locator('.export-table tbody tr').count();
  results.exportShowsEntry = exportRows >= 1;
  log(`Export zeigt mindestens 1 Zeile: ${results.exportShowsEntry} (${exportRows} Zeilen)`);

  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      page.click('#downloadBtn'),
    ]);
    const suggested = download.suggestedFilename();
    results.exportDownloadTriggered = /Zeiterfassung-Export\.json$/.test(suggested);
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
