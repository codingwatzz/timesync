// Umfassender End-to-End-Test ALLER bisherigen App-Funktionen.
// Läuft auf GitHub-Actions-Infrastruktur mit echtem Internetzugriff auf github.io/appwrite.io.
//
// WICHTIG - Sicherheitsprinzip: Der gesamte Test spielt sich in einem Monat weit in der
// Zukunft ab (Dezember, 2 Jahre voraus), damit garantiert NIE echte Nutzerdaten berührt,
// überschrieben oder gelöscht werden.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP_URL = 'https://codingwatzz.github.io/timesync/';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 10000;

const MINIMAL_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
xref
0 4
0000000000 65535 f 
trailer<</Size 4/Root 1 0 R>>
startxref
0
%%EOF`;

function log(msg) { console.log(`[e2e] ${msg}`); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
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
      if (/404/.test(text) && /Failed to load resource/.test(text)) return;
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const results = {};
  const shot = (name) => page.screenshot({ path: path.join(SCREENSHOT_DIR, name) }).catch(() => {});

  let loaded = false;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(`Lade Seite (Versuch ${attempt}/${MAX_RETRIES})…`);
    try {
      await page.goto(`${APP_URL}?cachebust=${Date.now()}`, { waitUntil: 'networkidle', timeout: 20000 });
      loaded = true;
      break;
    } catch (e) {
      log(`Ladeversuch fehlgeschlagen: ${e.message}`);
      await sleep(RETRY_DELAY_MS);
    }
  }
  results.loaded = loaded;
  if (!loaded) {
    fs.writeFileSync(path.join(__dirname, 'last-result.json'), JSON.stringify({ pass: false, results }, null, 2));
    console.error('FAIL: Seite konnte nicht geladen werden.');
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(1500);
  await shot('01_start.png');

  await page.click('#debugBtn');
  await page.waitForSelector('#debugOverlay.show', { timeout: 5000 });
  const debugTextStart = await page.locator('#debugContent').innerText();
  await page.click('#debugCloseBtn');
  results.syncActive = debugTextStart.includes('Appwrite Cloud-Sync (aktiv)');
  log(`Sync aktiv: ${results.syncActive}`);

  log('Navigiere in sicheren Testmonat (weit in der Zukunft)…');
  for (let i = 0; i < 24; i++) {
    await page.click('#nextM');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1000);
  for (let i = 0; i < 12; i++) {
    const label = await page.locator('.label').first().innerText();
    if (label.includes('Dezember')) break;
    await page.click('#nextM');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1500);
  const monthLabel = await page.locator('.label').first().innerText();
  log(`Aktueller Testmonat: ${monthLabel}`);
  results.testMonthIsDecember = monthLabel.includes('Dezember');
  await shot('02_test_month.png');

  const weekendCount = await page.locator('.day-row.weekend').count();
  results.weekendTilesFound = weekendCount;
  log(`Wochenend-Kacheln gefunden: ${weekendCount}`);

  const dayRows = page.locator('.day-row');
  const rowCount = await dayRows.count();
  let day25Tab = '', day26Tab = '';
  for (let i = 0; i < rowCount; i++) {
    const numText = await dayRows.nth(i).locator('.day-date .num').innerText();
    if (numText.trim() === '25') day25Tab = await dayRows.nth(i).locator('.tab').getAttribute('class');
    if (numText.trim() === '26') day26Tab = await dayRows.nth(i).locator('.tab').getAttribute('class');
  }
  results.holiday25Detected = day25Tab.includes('F');
  results.holiday26Detected = day26Tab.includes('F');
  log(`Feiertag 25.12. erkannt: ${results.holiday25Detected}, 26.12.: ${results.holiday26Detected}`);

  const TEST_NOTE = `E2E-Test ${new Date().toISOString()}`;

  // Defensiver Vor-Reset: falls ein vorheriger Testlauf abgebrochen ist und Tag 1/2 nicht
  // sauber zurückgelassen hat, hier vorsorglich in den Ausgangszustand bringen.
  async function resetDayToDefault(rowIndex){
    await dayRows.nth(rowIndex).click();
    await page.waitForSelector('.sheet', { timeout: 5000 });
    await page.fill('#f_beschreibung', '');
    await page.fill('#f_km', '');
    await page.fill('#f_transport', '');
    await page.fill('#f_hotel', '').catch(() => {});
    await page.fill('#f_bewirtung', '').catch(() => {});
    await page.fill('#f_sonstiges', '').catch(() => {});
    await page.fill('#f_start', '');
    await page.fill('#f_ende', '');
    await page.fill('#f_pause', '');
    // Reihenfolge wichtig: Reiseland/Reiseart-Reset MUSS vor dem Zurückschalten von Homeoffice
    // passieren (Reiseabschnitt verschwindet sonst, siehe Kommentar weiter unten im Cleanup).
    if (await page.locator('#f_reiseland').isVisible()) {
      await page.selectOption('#f_reiseland', 'Deutschland');
      await page.selectOption('#f_reiseart', '');
    }
    const frActiveNow = await page.locator('.yesno[data-field="fr"] button').evaluate((el) => el.classList.contains('active')).catch(() => false);
    if (frActiveNow) await page.click('.yesno[data-field="fr"] button');
    const hoOnNow = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
    if (!hoOnNow) await page.click('#hoSwitch');
    await page.click('#saveBtn');
    await page.waitForTimeout(600);
  }
  await resetDayToDefault(0);
  await resetDayToDefault(1);

  await dayRows.first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });

  results.homeofficeDefaultActive = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
  log(`Homeoffice-Default aktiv: ${results.homeofficeDefaultActive}`);

  await page.click('#typPick button[data-t="A"]');
  const hoOn = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
  if (hoOn) await page.click('#hoSwitch');
  await page.waitForTimeout(200);

  results.travelSectionVisible = await page.locator('#travelSection').isVisible();
  log(`Reiseabschnitt sichtbar (Typ A, kein HO): ${results.travelSectionVisible}`);

  results.reiseartWarningVisibleBefore = await page.locator('#reiseartWarn').isVisible();
  log(`Reiseart-Warnung sichtbar (vor Auswahl): ${results.reiseartWarningVisibleBefore}`);

  await page.fill('#f_start', '08:00');
  await page.fill('#f_ende', '17:00');
  await page.fill('#f_pause', '30');
  await page.fill('#f_beschreibung', TEST_NOTE);
  await page.fill('#f_km', '120');
  await page.fill('#f_transport', '15.50');
  await page.fill('#f_hotel', '90');
  await page.fill('#f_bewirtung', '12.30');
  await page.fill('#f_sonstiges', '7.50');
  await page.selectOption('#f_reiseland', 'Österreich');
  await page.selectOption('#f_reiseart', 'Abwesenheitstag (>8h)');
  await page.waitForTimeout(200);

  results.reiseartWarningVisibleAfter = await page.locator('#reiseartWarn').isVisible();
  log(`Reiseart-Warnung sichtbar (nach Auswahl, sollte false sein): ${results.reiseartWarningVisibleAfter}`);

  await page.click('.yesno[data-field="fr"] button');

  await page.setInputFiles('#pdfInput', testPdfPath);
  await page.waitForFunction(
    () => document.getElementById('toast')?.textContent?.includes('Beleg gespeichert'),
    { timeout: 10000 }
  ).catch(() => log('⚠ "Beleg gespeichert"-Toast nicht gesehen.'));
  await page.waitForTimeout(1000);
  if (!(await page.locator('.sheet').isVisible())) {
    await dayRows.first().click();
    await page.waitForSelector('.sheet', { timeout: 5000 });
  }
  results.receiptUploaded = (await page.locator('.receipt-item').count()) === 1;
  log(`Beleg erfolgreich hochgeladen: ${results.receiptUploaded}`);
  await shot('03_entry_with_receipt.png');

  const descAfterUpload = await page.locator('#f_beschreibung').inputValue();
  results.fieldsSurvivedReceiptUpload = descAfterUpload === TEST_NOTE;
  log(`Formularfelder überleben Beleg-Upload (Bugfix von vorhin): ${results.fieldsSurvivedReceiptUpload}`);
  if (!results.fieldsSurvivedReceiptUpload) {
    await page.fill('#f_beschreibung', TEST_NOTE);
    await page.fill('#f_km', '120');
    await page.fill('#f_transport', '15.50');
    await page.fill('#f_hotel', '90');
    await page.fill('#f_bewirtung', '12.30');
    await page.fill('#f_sonstiges', '7.50');
    if (await page.locator('#f_reiseland').isVisible()) {
      await page.selectOption('#f_reiseland', 'Österreich');
      await page.selectOption('#f_reiseart', 'Abwesenheitstag (>8h)');
    }
  }

  await page.click('#saveBtn');
  await page.waitForFunction(
    () => document.getElementById('toast')?.textContent?.includes('Gespeichert'),
    { timeout: 10000 }
  ).catch(() => log('⚠ "Gespeichert"-Toast nicht gesehen.'));
  await page.waitForTimeout(800);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 24; i++) { await page.click('#nextM'); await page.waitForTimeout(300); }
  await page.waitForTimeout(1000);
  for (let i = 0; i < 12; i++) {
    const label = await page.locator('.label').first().innerText();
    if (label.includes('Dezember')) break;
    await page.click('#nextM');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1500);
  await dayRows.first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });

  const persisted = {
    beschreibung: await page.locator('#f_beschreibung').inputValue(),
    start: await page.locator('#f_start').inputValue(),
    ende: await page.locator('#f_ende').inputValue(),
    pause: await page.locator('#f_pause').inputValue(),
    km: await page.locator('#f_km').inputValue(),
    transport: await page.locator('#f_transport').inputValue(),
    hotel: await page.locator('#f_hotel').inputValue(),
    bewirtung: await page.locator('#f_bewirtung').inputValue(),
    sonstiges: await page.locator('#f_sonstiges').inputValue(),
    reiseland: await page.locator('#f_reiseland').inputValue(),
    reiseart: await page.locator('#f_reiseart').inputValue(),
  };
  results.persistedValues = persisted;
  results.allFieldsPersisted =
    persisted.beschreibung === TEST_NOTE &&
    persisted.start === '08:00' && persisted.ende === '17:00' && persisted.pause === '30' &&
    Number(persisted.km) === 120 && Number(persisted.transport) === 15.5 &&
    Number(persisted.hotel) === 90 && Number(persisted.bewirtung) === 12.3 &&
    Number(persisted.sonstiges) === 7.5 &&
    persisted.reiseland === 'Österreich' && persisted.reiseart === 'Abwesenheitstag (>8h)';
  log(`Alle Felder korrekt persistiert: ${results.allFieldsPersisted}`);
  log(`Gelesene Werte: ${JSON.stringify(persisted)}`);
  await shot('04_after_reload.png');

  results.receiptPersisted = (await page.locator('.receipt-item').count()) === 1;
  log(`Beleg nach Reload noch vorhanden: ${results.receiptPersisted}`);

  await page.click('.receipt-item .del');
  await page.waitForTimeout(1500);
  if (!(await page.locator('.sheet').isVisible())) {
    await dayRows.first().click();
    await page.waitForSelector('.sheet', { timeout: 5000 });
  }
  results.receiptDeleted = (await page.locator('.receipt-item').count()) === 0;
  log(`Beleg erfolgreich gelöscht: ${results.receiptDeleted}`);

  await page.click('#closeBtn').catch(() => {});
  await page.waitForTimeout(500);

  await page.click('#exportBtn');
  await page.waitForSelector('.export-view', { timeout: 5000 });
  const exportRows = await page.locator('.export-table tbody tr').count();
  results.exportShowsEntry = exportRows >= 1;
  log(`Export zeigt mindestens 1 Zeile: ${results.exportShowsEntry} (${exportRows} Zeilen)`);
  await shot('05_export_view.png');

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
  await page.waitForTimeout(500);

  const yearMatch = monthLabel.match(/(\d{4})/);
  const testYear = yearMatch ? yearMatch[1] : String(new Date().getFullYear() + 2);
  const importDateKey = `${testYear}-12-02`;
  const importPayload = {
    format: 'zeiterfassung-export-v1',
    entries: [{
      date: importDateKey, typ: 'A', ho: false,
      beschreibung: 'Import-Test-Eintrag', km: 50, transport: 10, hotel: 0,
      bewirtung: 0, sonstiges: 0, reiseland: 'Deutschland', reiseart: 'Abreisetag',
      fr: false, mi: false, ab: false,
    }],
  };
  fs.writeFileSync(testImportPath, JSON.stringify(importPayload));
  await page.setInputFiles('#importFileInput', testImportPath);
  await page.waitForFunction(
    () => document.getElementById('toast')?.textContent?.includes('importiert'),
    { timeout: 10000 }
  ).catch(() => log('⚠ Import-Toast nicht gesehen.'));
  await page.waitForTimeout(1000);

  const day2Row = dayRows.nth(1);
  await day2Row.click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  const importedDesc = await page.locator('#f_beschreibung').inputValue();
  results.importWorked = importedDesc === 'Import-Test-Eintrag';
  log(`Import erfolgreich (Tag 2 zeigt importierten Eintrag): ${results.importWorked}`);
  await shot('06_after_import.png');

  await page.fill('#f_beschreibung', '');
  await page.click('#saveBtn');
  await page.waitForTimeout(800);
  await dayRows.first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.fill('#f_beschreibung', '');
  await page.fill('#f_km', '');
  await page.fill('#f_transport', '');
  await page.fill('#f_hotel', '');
  await page.fill('#f_bewirtung', '');
  await page.fill('#f_sonstiges', '');
  await page.fill('#f_start', '');
  await page.fill('#f_ende', '');
  await page.fill('#f_pause', '');
  // Vollständig auf Ausgangszustand zurücksetzen (wichtig für Idempotenz bei wiederholten
  // Testläufen, sonst würden z.B. "Homeoffice-Default"- oder "Warnung sichtbar"-Prüfungen im
  // nächsten Lauf fälschlich fehlschlagen, weil der Tag nicht mehr "leer" ist):
  // WICHTIG: Reiseland/Reiseart/Frühstück-Reset MUSS VOR dem Zurückschalten von Homeoffice
  // passieren, weil der Reiseabschnitt (und damit diese Buttons) verschwindet, sobald
  // Homeoffice wieder an ist!
  if (await page.locator('#f_reiseland').isVisible()) {
    await page.selectOption('#f_reiseland', 'Deutschland');
    await page.selectOption('#f_reiseart', '');
  }
  const fruehstueckActive = await page.locator('.yesno[data-field="fr"] button').evaluate((el) => el.classList.contains('active'));
  if (fruehstueckActive) await page.click('.yesno[data-field="fr"] button');
  const hoOnAfter = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
  if (!hoOnAfter) await page.click('#hoSwitch'); // zurück auf Standard: an
  await page.click('#saveBtn');
  await page.waitForTimeout(800);

  // Auch den Import-Testtag (Tag 2) wieder vollständig zurücksetzen
  await dayRows.nth(1).click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.fill('#f_beschreibung', '');
  await page.fill('#f_km', '');
  await page.fill('#f_transport', '');
  if (await page.locator('#f_reiseland').isVisible()) {
    await page.selectOption('#f_reiseland', 'Deutschland');
    await page.selectOption('#f_reiseart', '');
  }
  const day2HoOn = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
  if (!day2HoOn) await page.click('#hoSwitch');
  await page.click('#saveBtn');
  await page.waitForTimeout(800);

  await page.click('#debugBtn');
  await page.waitForSelector('#debugOverlay.show', { timeout: 5000 });
  const debugTextEnd = await page.locator('#debugContent').innerText();
  await page.click('#debugCloseBtn');
  results.debugPanelStart = debugTextStart;
  results.debugPanelEnd = debugTextEnd;

  await browser.close();

  results.consoleErrors = consoleErrors;
  results.pageErrors = pageErrors;
  results.timestamp = new Date().toISOString();

  const criticalChecks = [
    'loaded', 'syncActive', 'testMonthIsDecember', 'holiday25Detected', 'holiday26Detected',
    'homeofficeDefaultActive', 'travelSectionVisible', 'reiseartWarningVisibleBefore',
    'receiptUploaded', 'fieldsSurvivedReceiptUpload', 'allFieldsPersisted', 'receiptPersisted',
    'receiptDeleted', 'exportShowsEntry', 'exportDownloadTriggered', 'importWorked',
  ];
  const failedChecks = criticalChecks.filter((k) => results[k] !== true);
  results.reiseartWarningVisibleAfterOk = results.reiseartWarningVisibleAfter === false;
  if (!results.reiseartWarningVisibleAfterOk) failedChecks.push('reiseartWarningVisibleAfter');

  results.pass = failedChecks.length === 0 && pageErrors.length === 0;
  results.failedChecks = failedChecks;

  fs.writeFileSync(path.join(__dirname, 'last-result.json'), JSON.stringify(results, null, 2));

  log('--- Zusammenfassung ---');
  Object.entries(results).forEach(([k, v]) => {
    if (typeof v === 'object') return;
    log(`${k}: ${v}`);
  });
  log(`Fehlgeschlagene Prüfungen: ${failedChecks.join(', ') || '(keine)'}`);
  log(`Konsolenfehler: ${consoleErrors.length}, Seitenfehler: ${pageErrors.length}`);

  if (!results.pass) {
    console.error('FAIL: siehe failedChecks oben.');
    process.exit(1);
  }
  log('PASS: alle Prüfungen erfolgreich.');
}

main().catch((e) => {
  const result = { pass: false, crashed: true, error: String((e && e.stack) || e), timestamp: new Date().toISOString() };
  try { fs.writeFileSync(path.join(__dirname, 'last-result.json'), JSON.stringify(result, null, 2)); } catch (_) {}
  console.error('FAIL (unerwarteter Fehler):', e);
  process.exit(1);
});
