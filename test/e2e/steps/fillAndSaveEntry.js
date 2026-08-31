const { log, sleep } = require('../utils');
const { directAppwriteRead } = require('../appwriteDirectCheck');

/**
 * Öffnet Tag 1, prüft Homeoffice-Default/Reiseabschnitt-Sichtbarkeit/Warnung, befüllt alle
 * Felder, lädt einen Testbeleg hoch, speichert. Prüft direkt danach (noch ohne Reload), ob die
 * Werte im Browser UND direkt bei Appwrite ankommen (letzteres zeigte am 31.08.2026 die
 * "Eventual Consistency"-Verzögerung von Appwrite - Werte können kurz nach dem Schreiben noch
 * nicht überall lesbar sein).
 */
async function fillAndSaveTestEntry(page, dayRows, { testPdfPath, day1RowId }) {
  const results = {};
  const TEST_NOTE = `E2E-Test ${new Date().toISOString()}`;

  await dayRows.first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });

  results.homeofficeDefaultActive = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
  log(`Homeoffice-Default aktiv: ${results.homeofficeDefaultActive}`);

  await page.click('#typPick button[data-t="A"]');
  const hoOn = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
  if (hoOn) await page.click('#hoSwitch');
  await sleep(200);

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
  await sleep(200);

  results.reiseartWarningVisibleAfter = await page.locator('#reiseartWarn').isVisible();
  log(`Reiseart-Warnung sichtbar (nach Auswahl, sollte false sein): ${results.reiseartWarningVisibleAfter}`);

  await page.click('.yesno[data-field="fr"] button');

  await page.setInputFiles('#pdfInput', testPdfPath);
  await page.waitForFunction(
    () => document.getElementById('toast')?.textContent?.includes('Beleg gespeichert'),
    { timeout: 10000 },
  ).catch(() => log('⚠ "Beleg gespeichert"-Toast nicht gesehen.'));
  await sleep(1000);
  if (!(await page.locator('.sheet').isVisible())) {
    await dayRows.first().click();
    await page.waitForSelector('.sheet', { timeout: 5000 });
  }
  await page.waitForSelector('.receipt-item', { timeout: 5000 }).catch(() => {});
  const countAfterUpload = await page.locator('.receipt-item').count();
  results.receiptUploaded = countAfterUpload === 1;
  log(`Beleg erfolgreich hochgeladen: ${results.receiptUploaded}`);

  const descAfterUpload = await page.locator('#f_beschreibung').inputValue();
  results.fieldsSurvivedReceiptUpload = descAfterUpload === TEST_NOTE;
  log(`Formularfelder überleben Beleg-Upload: ${results.fieldsSurvivedReceiptUpload}`);
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
    { timeout: 10000 },
  ).catch(() => log('⚠ "Gespeichert"-Toast nicht gesehen.'));
  await sleep(800);

  // Sofort (noch ohne Reload) nachsehen, ob Werte im Browser ankommen.
  await dayRows.first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  results.immediateAfterSave = {
    beschreibung: await page.locator('#f_beschreibung').inputValue(),
    km: await page.locator('#f_km').inputValue(),
  };
  log(`Sofort nach Speichern (vor Reload): ${JSON.stringify(results.immediateAfterSave)}`);

  results.directReadRightAfterSave = await directAppwriteRead(page, day1RowId, 'sofort nach Speichern');

  await page.click('#closeBtn').catch(() => {});
  await sleep(300);

  return { results, TEST_NOTE };
}

module.exports = { fillAndSaveTestEntry };
