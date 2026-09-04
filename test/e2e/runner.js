// Orchestriert alle Testphasen. Jede Phase ist ein eigenes, unabhängig lesbares Modul unter
// steps/ - analog zur App-Architektur (App.tsx führt Komponenten zusammen, enthält aber keine
// Fachlogik selbst). Dieser Umbau (statt einer 600-Zeilen-Datei) war eine direkte Lehre aus der
// langen Debugging-Sitzung am 31.08.2026: das Testskript hatte selbst nicht die Modularität,
// die wir der eigentlichen App auferlegt hatten.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const { RESULT_FILE, SCREENSHOT_DIR } = require('./config');
const { log, MINIMAL_PDF } = require('./utils');
const { navigateToSafeTestMonth } = require('./navigation');
const { resetDayToDefault } = require('./dayHelpers');
const { toAppwriteRowId } = require('./appwriteDirectCheck');

const { loadPage } = require('./steps/load');
const { readDiagnosePanel } = require('./steps/diagnose');
const { fillAndSaveTestEntry } = require('./steps/fillAndSaveEntry');
const { reloadAndVerifyEntry } = require('./steps/reloadAndVerify');
const { checkExportFlow } = require('./steps/exportFlow');
const { checkImportFlow } = require('./steps/importFlow');
const { cleanupTestDays } = require('./steps/cleanup');

const CRITICAL_CHECKS = [
  'loaded', 'syncActive', 'testMonthIsDecember',
  'homeofficeDefaultActive', 'travelSectionVisible', 'reiseartWarningVisibleBefore',
  'receiptUploaded', 'fieldsSurvivedReceiptUpload', 'allFieldsPersisted', 'receiptPersisted',
  'receiptDeleted', 'exportShowsEntry', 'exportDownloadTriggered', 'importWorked',
];

async function attemptRun() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const testPdfPath = path.join(SCREENSHOT_DIR, 'test-beleg.pdf');
  fs.writeFileSync(testPdfPath, MINIMAL_PDF);
  const testImportPath = path.join(SCREENSHOT_DIR, 'test-import.json');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (/404/.test(text) && /Failed to load resource/.test(text)) return; // erwartet (leere Tage)
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  let results = {};
  const shot = (name) => page.screenshot({ path: path.join(SCREENSHOT_DIR, name) }).catch(() => {});
  const writePartialResult = () => {
    try { fs.writeFileSync(path.join(__dirname, '..', RESULT_FILE), JSON.stringify(results, null, 2)); } catch (_) {}
  };

  try {
    // ---------- 1. Laden ----------
    results.loaded = await loadPage(page);
    if (!results.loaded) {
      writePartialResult();
      throw new Error('Seite konnte nicht geladen werden.');
    }
    await shot('01_start.png');

    // ---------- 2. Diagnose: Sync-Status ----------
    const debugTextStart = await readDiagnosePanel(page);
    results.syncActive = debugTextStart.includes('Appwrite Cloud-Sync (aktiv)');
    log(`Sync aktiv: ${results.syncActive}`);

    // ---------- 3. Navigation in sicheren Testmonat ----------
    log('Navigiere in sicheren Testmonat (weit in der Zukunft)…');
    const monthLabel = await navigateToSafeTestMonth(page);
    results.testMonthIsDecember = monthLabel.includes('Dezember');
    await shot('02_test_month.png');

    const dayRows = page.locator('.day-row');

    // ---------- 4. Defensiver Vor-Reset (falls Vorlauf abgebrochen wurde) ----------
    await resetDayToDefault(page, dayRows, 0);
    await resetDayToDefault(page, dayRows, 1);

    // ---------- 5. Tag 1 befüllen, Beleg hochladen, speichern ----------
    const yearMatch = monthLabel.match(/(\d{4})/);
    const testYear = yearMatch ? yearMatch[1] : String(new Date().getFullYear() + 2);
    const day1RowId = toAppwriteRowId(`entry:${testYear}-12-01`);

    const { results: fillResults, TEST_NOTE } = await fillAndSaveTestEntry(page, dayRows, { testPdfPath, day1RowId });
    Object.assign(results, fillResults);
    await shot('03_entry_with_receipt.png');

    // ---------- 6. Reload + vollständige Verifikation ----------
    const reloadResults = await reloadAndVerifyEntry(page, dayRows, {
      TEST_NOTE, day1RowId, monthLabelBeforeReload: monthLabel,
    });
    Object.assign(results, reloadResults);
    await shot('04_after_reload.png');

    // ---------- 7. Export ----------
    Object.assign(results, await checkExportFlow(page));
    await shot('05_export_view.png');

    // ---------- 8. Import ----------
    Object.assign(results, await checkImportFlow(page, dayRows, { testYear, testImportPath }));
    await shot('06_after_import.png');

    // ---------- 9. Aufräumen ----------
    await cleanupTestDays(page, dayRows);

    // ---------- 10. Diagnose-Ende ----------
    results.debugPanelStart = debugTextStart;
    results.debugPanelEnd = await readDiagnosePanel(page);
  } finally {
    await browser.close();
  }

  results.consoleErrors = consoleErrors;
  results.pageErrors = pageErrors;
  results.timestamp = new Date().toISOString();

  const failedChecks = CRITICAL_CHECKS.filter((k) => results[k] !== true);
  results.reiseartWarningVisibleAfterOk = results.reiseartWarningVisibleAfter === false;
  if (!results.reiseartWarningVisibleAfterOk) failedChecks.push('reiseartWarningVisibleAfter');

  results.pass = failedChecks.length === 0 && pageErrors.length === 0;
  results.failedChecks = failedChecks;
  writePartialResult();

  log('--- Zusammenfassung ---');
  Object.entries(results).forEach(([k, v]) => {
    if (typeof v === 'object') return;
    log(`${k}: ${v}`);
  });
  log(`Fehlgeschlagene Prüfungen: ${failedChecks.join(', ') || '(keine)'}`);
  log(`Konsolenfehler: ${consoleErrors.length}, Seitenfehler: ${pageErrors.length}`);

  if (!results.pass) {
    throw new Error('E2E-Prüfungen fehlgeschlagen: ' + (failedChecks.join(', ') || 'unbekannt'));
  }
  log('PASS: alle Prüfungen erfolgreich.');
}

module.exports = { attemptRun };
