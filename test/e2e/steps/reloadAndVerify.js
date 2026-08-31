const { log, sleep } = require('../utils');
const { navigateToSafeTestMonth, waitForAppReady } = require('../navigation');
const { directAppwriteRead } = require('../appwriteDirectCheck');

/**
 * Lädt die Seite komplett neu, navigiert erneut in den Testmonat, und prüft dann, ob alle
 * zuvor gespeicherten Werte (Felder + Beleg) tatsächlich zurückkommen. Vergleicht dabei
 * explizit den Monat vor/nach Reload (Regressionsschutz gegen einen früheren Verdacht) und
 * macht einen zweiten direkten Appwrite-Read zum Vergleich mit dem vor dem Reload.
 */
async function reloadAndVerifyEntry(page, dayRows, { TEST_NOTE, day1RowId, monthLabelBeforeReload }) {
  const results = {};

  await page.reload({ waitUntil: 'networkidle' });
  await waitForAppReady(page);

  const monthLabelAfterReload = await navigateToSafeTestMonth(page);
  results.monthLabelBeforeReload = monthLabelBeforeReload;
  results.monthLabelAfterReload = monthLabelAfterReload;
  results.sameMonthAfterReload = monthLabelAfterReload === monthLabelBeforeReload;
  log(`Monat vor Reload: "${monthLabelBeforeReload}" / nach Reload: "${monthLabelAfterReload}" -> gleich: ${results.sameMonthAfterReload}`);

  await dayRows.first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });

  results.directReadAfterReload = await directAppwriteRead(page, day1RowId, 'nach Reload, vor Feldprüfung');

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
  // .normalize(): "ö" kann unterschiedlich kodiert sein (siehe appwriteDirectCheck.js-Kommentar
  // an anderer Stelle) - sieht beim Loggen identisch aus, ist aber bei "===" ggf. nicht gleich.
  results.allFieldsPersisted =
    persisted.beschreibung === TEST_NOTE &&
    persisted.start === '08:00' && persisted.ende === '17:00' && persisted.pause === '30' &&
    Number(persisted.km) === 120 && Number(persisted.transport) === 15.5 &&
    Number(persisted.hotel) === 90 && Number(persisted.bewirtung) === 12.3 &&
    Number(persisted.sonstiges) === 7.5 &&
    persisted.reiseland.normalize() === 'Österreich'.normalize() &&
    persisted.reiseart.normalize() === 'Abwesenheitstag (>8h)'.normalize();
  log(`Alle Felder korrekt persistiert: ${results.allFieldsPersisted}`);

  await page.waitForSelector('.receipt-item', { timeout: 5000 }).catch(() => {});
  const countAfterReload = await page.locator('.receipt-item').count();
  results.receiptPersisted = countAfterReload === 1;
  log(`Beleg nach Reload noch vorhanden: ${results.receiptPersisted}`);

  // Löschen in try/catch: ein seltenes Timing-Problem hier soll nur diese eine Prüfung
  // scheitern lassen, nicht den ganzen Testlauf abstürzen.
  try {
    await page.click('.receipt-item .del', { timeout: 8000 });
    await page.waitForSelector('.receipt-item', { state: 'detached', timeout: 5000 }).catch(() => {});
  } catch (e) {
    log(`⚠ Beleg-Löschen fehlgeschlagen: ${e.message}`);
  }
  await sleep(500);
  if (!(await page.locator('.sheet').isVisible())) {
    await dayRows.first().click();
    await page.waitForSelector('.sheet', { timeout: 5000 });
  }
  const countAfterDelete = await page.locator('.receipt-item').count();
  results.receiptDeleted = countAfterDelete === 0;
  log(`Beleg erfolgreich gelöscht: ${results.receiptDeleted}`);

  await page.click('#closeBtn').catch(() => {});
  await sleep(500);

  return results;
}

module.exports = { reloadAndVerifyEntry };
