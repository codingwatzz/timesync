// Umfassender End-to-End-Test ALLER bisherigen App-Funktionen.
// Läuft auf GitHub-Actions-Infrastruktur mit echtem Internetzugriff auf github.io/appwrite.io.
//
// WICHTIG - Sicherheitsprinzip: Der gesamte Test spielt sich in einem Monat weit in der
// Zukunft ab (Dezember, 2 Jahre voraus), damit garantiert NIE echte Nutzerdaten berührt,
// überschrieben oder gelöscht werden.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP_URL = process.env.APP_URL || 'https://codingwatzz.github.io/timesync/';
const RESULT_FILE = process.env.RESULT_FILE || 'last-result.json';
// Wie viele Monate in die Zukunft navigiert wird, bevor der Test beginnt. WICHTIG: Wenn
// mehrere Test-Suiten (z.B. Produktion + React-Vorschau) dieselbe Appwrite-Datenbank nutzen,
// MUSS dieser Wert zwischen den Suiten unterschiedlich sein, sonst schreiben sich parallel
// laufende Testläufe gegenseitig die Testdaten weg (siehe Vorfall vom 30.08.2026).
// War lange auf 24 - nach sehr vielen (teils abgebrochenen) Testläufen heute im selben
// Zielmonat auf 60 erhöht, um garantiert einen komplett unberührten, "sauberen" Testmonat
// zu treffen und angesammelte Altlasten als Fehlerquelle auszuschließen.
const MONTHS_FORWARD = Number(process.env.MONTHS_FORWARD || 60);
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
    fs.writeFileSync(path.join(__dirname, RESULT_FILE), JSON.stringify({ pass: false, results }, null, 2));
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
  for (let i = 0; i < MONTHS_FORWARD; i++) {
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
  results.debugCounts = {};

  // Defensiver Vor-Reset: falls ein vorheriger Testlauf abgebrochen ist und Tag 1/2 nicht
  // sauber zurückgelassen hat, hier vorsorglich in den Ausgangszustand bringen.
  async function resetDayToDefault(rowIndex){
    await dayRows.nth(rowIndex).click();
    await page.waitForSelector('.sheet', { timeout: 5000 });
    // Zuerst alle eventuell von abgebrochenen Vorläufen übrig gebliebenen Belege entfernen,
    // sonst zählen spätere Prüfungen ("genau 1 Beleg") wegen alter Leichen falsch.
    await page.waitForTimeout(1500); // Belege werden asynchron nachgeladen - großzügig warten
    const beforeCleanup = await page.locator('.receipt-item').count();
    let safety = 0;
    while ((await page.locator('.receipt-item .del').count()) > 0 && safety < 10) {
      await page.click('.receipt-item .del');
      await page.waitForTimeout(1200);
      safety++;
    }
    const afterCleanup = await page.locator('.receipt-item').count();
    results.debugCounts[`day${rowIndex}_receiptsBeforeCleanup`] = beforeCleanup;
    results.debugCounts[`day${rowIndex}_receiptsAfterCleanup`] = afterCleanup;
    results.debugCounts[`day${rowIndex}_cleanupIterations`] = safety;
    // Erst Typ 'A' setzen UND Homeoffice ausschalten, damit der Reiseabschnitt (und damit
    // die km/Transport/etc.-Felder) überhaupt sichtbar sind, BEVOR wir versuchen, sie zu leeren.
    await page.click('#typPick button[data-t="A"]');
    const hoOnAtStart = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
    if (hoOnAtStart) await page.click('#hoSwitch');
    await page.waitForTimeout(150);

    await page.fill('#f_beschreibung', '');
    await page.fill('#f_start', '');
    await page.fill('#f_ende', '');
    await page.fill('#f_pause', '');
    if (await page.locator('#f_km').isVisible()) {
      await page.fill('#f_km', '');
      await page.fill('#f_transport', '');
      await page.fill('#f_hotel', '').catch(() => {});
      await page.fill('#f_bewirtung', '').catch(() => {});
      await page.fill('#f_sonstiges', '').catch(() => {});
      await page.selectOption('#f_reiseland', 'Deutschland');
      await page.selectOption('#f_reiseart', '');
    }
    const frActiveNow = await page.locator('.yesno[data-field="fr"] button').evaluate((el) => el.classList.contains('active')).catch(() => false);
    if (frActiveNow) await page.click('.yesno[data-field="fr"] button');
    // Reihenfolge wichtig: Reiseabschnitt-Reset MUSS vor dem Zurückschalten von Homeoffice
    // passieren (Reiseabschnitt verschwindet sonst, siehe Kommentar weiter unten im Cleanup).
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
  // Belege werden asynchron nachgeladen (eigener Netzwerk-Roundtrip) - explizit warten,
  // statt sofort zu zählen (.count() wartet anders als .click() nicht auf das Erscheinen).
  await page.waitForSelector('.receipt-item', { timeout: 5000 }).catch(() => {});
  const countAfterUpload = await page.locator('.receipt-item').count();
  results.debugCounts.countAfterUpload = countAfterUpload;
  results.receiptUploaded = countAfterUpload === 1;
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
  for (let i = 0; i < MONTHS_FORWARD; i++) { await page.click('#nextM'); await page.waitForTimeout(300); }
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

  // .count() wartet (anders als .click()/.waitForSelector()) NICHT darauf, dass ein Element
  // erscheint - da Belege asynchron nachgeladen werden (eigener Netzwerk-Roundtrip), hier
  // explizit kurz warten, um ein verfrühtes "0 gefunden" zu vermeiden.
  await page.waitForSelector('.receipt-item', { timeout: 5000 }).catch(() => {});
  const countAfterReload = await page.locator('.receipt-item').count();
  results.debugCounts.countAfterReload = countAfterReload;
  results.receiptPersisted = countAfterReload === 1;
  log(`Beleg nach Reload noch vorhanden: ${results.receiptPersisted}`);

  // Löschen in try/catch: falls das Beleg-Item gerade in diesem Moment nicht klickbar ist
  // (bisher nicht zuverlässig reproduzierbares, seltenes Timing-Problem), soll das NUR diese
  // eine Prüfung als fehlgeschlagen markieren, statt den kompletten Testlauf abstürzen zu
  // lassen - damit wir bei jedem Lauf vollständige Diagnosedaten für alle ANDEREN Prüfungen
  // bekommen, statt eines undurchsichtigen Totalabbruchs.
  try {
    await page.click('.receipt-item .del', { timeout: 8000 });
    await page.waitForSelector('.receipt-item', { state: 'detached', timeout: 5000 }).catch(() => {});
  } catch (e) {
    log(`⚠ Beleg-Löschen fehlgeschlagen: ${e.message}`);
  }
  await page.waitForTimeout(500);
  if (!(await page.locator('.sheet').isVisible())) {
    await dayRows.first().click();
    await page.waitForSelector('.sheet', { timeout: 5000 });
  }
  const countAfterDelete = await page.locator('.receipt-item').count();
  results.debugCounts.countAfterDelete = countAfterDelete;
  results.receiptDeleted = countAfterDelete === 0;
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
  // WICHTIG: Die App zeigt den "importiert"-Toast, BEVOR der anschließende reload() der
  // Monatsdaten abgeschlossen ist (showToast steht im Code vor dem await reload()).
  // Eine feste Wartezeit reicht deshalb nicht zuverlässig - stattdessen explizit darauf
  // warten, dass der importierte Text wirklich in der Monatsansicht auftaucht.
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.day-mid .desc'))
      .some((el) => el.textContent?.includes('Import-Test-Eintrag')),
    { timeout: 10000 }
  ).catch(() => log('⚠ Importierter Eintrag nach 10s noch nicht in Monatsansicht sichtbar.'));

  const day2Row = dayRows.nth(1);
  await day2Row.click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  const importedDesc = await page.locator('#f_beschreibung').inputValue();
  results.importWorked = importedDesc === 'Import-Test-Eintrag';
  results.importedDescActual = importedDesc;
  log(`Import erfolgreich (Tag 2 zeigt importierten Eintrag): ${results.importWorked} (gelesen: "${importedDesc}")`);
  await shot('06_after_import.png');

  await page.fill('#f_beschreibung', '');
  await page.click('#saveBtn');
  await page.waitForTimeout(800);
  await dayRows.first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.fill('#f_beschreibung', '');
  await page.fill('#f_start', '');
  await page.fill('#f_ende', '');
  await page.fill('#f_pause', '');
  // Vollständig auf Ausgangszustand zurücksetzen (wichtig für Idempotenz bei wiederholten
  // Testläufen, sonst würden z.B. "Homeoffice-Default"- oder "Warnung sichtbar"-Prüfungen im
  // nächsten Lauf fälschlich fehlschlagen, weil der Tag nicht mehr "leer" ist):
  // WICHTIG: Reiseabschnitt-Felder (km/Transport/etc./Reiseland/Reiseart/Frühstück) MÜSSEN
  // VOR dem Zurückschalten von Homeoffice geleert werden, weil der ganze Abschnitt
  // verschwindet, sobald Homeoffice wieder an ist - und ERST NACHDEM sichergestellt ist,
  // dass Typ 'A' + Homeoffice AUS gesetzt sind, damit der Abschnitt überhaupt sichtbar ist.
  await page.click('#typPick button[data-t="A"]');
  const hoOnBeforeCleanup = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
  if (hoOnBeforeCleanup) await page.click('#hoSwitch');
  await page.waitForTimeout(150);
  if (await page.locator('#f_km').isVisible()) {
    await page.fill('#f_km', '');
    await page.fill('#f_transport', '');
    await page.fill('#f_hotel', '');
    await page.fill('#f_bewirtung', '');
    await page.fill('#f_sonstiges', '');
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
  // Wie beim Tag-1-Reset: erst Typ 'A' setzen + Homeoffice aus, damit die km/Transport-Felder
  // überhaupt sichtbar sind, BEVOR wir versuchen sie zu leeren.
  await page.click('#typPick button[data-t="A"]');
  const day2HoOnAtStart = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
  if (day2HoOnAtStart) await page.click('#hoSwitch');
  await page.waitForTimeout(150);
  if (await page.locator('#f_km').isVisible()) {
    await page.fill('#f_km', '');
    await page.fill('#f_transport', '');
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

  fs.writeFileSync(path.join(__dirname, RESULT_FILE), JSON.stringify(results, null, 2));

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
  try { fs.writeFileSync(path.join(__dirname, RESULT_FILE), JSON.stringify(result, null, 2)); } catch (_) {}
  console.error('FAIL (unerwarteter Fehler):', e);
  process.exit(1);
});
