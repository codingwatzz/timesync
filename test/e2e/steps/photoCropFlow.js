const { log, sleep } = require('../utils');

/**
 * Prüft den neuen manuellen Zuschnitt-Dialog für per Foto hochgeladene Belege (09.09.2026):
 * Foto auswählen -> Zuschnitt-Modal erscheint -> Rahmen wird tatsächlich verändert -> erst DANN
 * ist "Übernehmen" aktiv -> PDF wird wie gewohnt erzeugt und gespeichert.
 *
 * Nutzt #photoInput direkt mit einer Test-PNG (kein echtes Kamera-UI nötig - capture=
 * "environment" beeinflusst nur, WELCHE native Auswahl das Betriebssystem anbietet, nicht das
 * <input>-Element selbst; setInputFiles() landet unverändert im normalen onChange-Handler,
 * exakt wie eine "aus Galerie wählen"-Auswahl).
 *
 * Bewusst ein ANDERER Tag (dayRows.nth(1)) als der PDF-Upload-Test in fillAndSaveEntry.js
 * (dayRows.first()) - beide Schritte laufen nacheinander im selben Testlauf, ein gemeinsamer
 * Tag hätte den jeweils anderen Beleg-Zähler verfälscht.
 */
async function checkPhotoCropFlow(page, dayRows, { testPhotoPath }) {
  const results = {};

  await dayRows.nth(1).click();
  await page.waitForSelector('.sheet', { timeout: 5000 });

  await page.setInputFiles('#photoInput', testPhotoPath);

  results.cropModalAppeared = await page
    .waitForSelector('#cropConfirmBtn', { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  log(`Zuschnitt-Modal erscheint nach Foto-Auswahl: ${results.cropModalAppeared}`);

  if (results.cropModalAppeared) {
    // Vor jeder Interaktion: "Übernehmen" darf NICHT vor einem ECHTEN Zuschnitt aktiv sein
    // (completedCrop ist erst nach onComplete gesetzt, nicht schon nach der initialen 90%-
    // Voreinstellung aus onImageLoad - siehe PhotoCropModal.tsx).
    results.confirmDisabledInitially = !(await page.locator('#cropConfirmBtn').isEnabled());
    log(`"Übernehmen" initial deaktiviert (vor jeder Zieh-Interaktion): ${results.confirmDisabledInitially}`);

    // Rahmen von der rechten unteren Ecke aus etwas verkleinern, damit onComplete sicher mit
    // einem echten (nicht nur dem initialen) Crop feuert.
    const handle = page.locator('.ReactCrop__drag-handle.ord-se');
    const box = await handle.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x - 15, box.y - 15, { steps: 5 });
      await page.mouse.up();
    } else {
      log('⚠ Zieh-Griff (.ReactCrop__drag-handle.ord-se) nicht gefunden - Crop bleibt bei der 90%-Voreinstellung.');
    }
    await sleep(200);

    results.confirmEnabledAfterDrag = await page.locator('#cropConfirmBtn').isEnabled();
    log(`"Übernehmen" aktiviert nach Zuschnitt-Interaktion: ${results.confirmEnabledAfterDrag}`);

    await page.click('#cropConfirmBtn');
    results.toastAfterCrop = await page
      .waitForFunction(
        () => document.getElementById('toast')?.textContent?.includes('Beleg gespeichert'),
        undefined,
        { timeout: 10000 },
      )
      .then(() => true)
      .catch(() => false);
    log(`"Beleg gespeichert"-Toast nach Zuschnitt-Bestätigung: ${results.toastAfterCrop}`);
  }

  await sleep(500);
  if (!(await page.locator('.sheet').isVisible())) {
    await dayRows.nth(1).click();
    await page.waitForSelector('.sheet', { timeout: 5000 });
  }
  await page.waitForSelector('.receipt-item', { timeout: 5000 }).catch(() => {});
  results.croppedReceiptUploaded = (await page.locator('.receipt-item').count()) === 1;
  log(`Zugeschnittener Beleg erfolgreich hochgeladen: ${results.croppedReceiptUploaded}`);

  await page.click('#closeBtn').catch(() => {});
  await sleep(300);

  return results;
}

module.exports = { checkPhotoCropFlow };
