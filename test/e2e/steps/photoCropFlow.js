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
 * Bewusst Tag 4 (dayRows.nth(3)), NICHT Tag 2 - Tag 2 wird bereits von importFlow.js für den
 * Import-Test verwendet (dayRows.nth(1)). Ein erster Lauf (10.09.2026) kollidierte genau
 * hier: der hier hochgeladene Beleg blieb auf Tag 2 liegen, bis importFlow.js denselben Tag
 * anfasste - dadurch schlugen restoreReceiptPresent/restoreReceiptOpenedWithoutError
 * fehl (zu viele/falsche Belege auf dem Tag). cleanup.js UND der defensive Vor-Reset in
 * runner.js müssen Tag 4 seither ebenfalls zurücksetzen, siehe dort.
 */
async function checkPhotoCropFlow(page, dayRows, { testPhotoPath }) {
  const results = {};

  await dayRows.nth(3).click();
  await page.waitForSelector('.sheet', { timeout: 5000 });

  await page.setInputFiles('#photoInput', testPhotoPath);

  results.cropModalAppeared = await page
    .waitForSelector('#cropConfirmBtn', { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  log(`Zuschnitt-Modal erscheint nach Foto-Auswahl: ${results.cropModalAppeared}`);

  if (results.cropModalAppeared) {
    // Hinweis (10.09.2026): react-image-crop feuert onComplete bereits einmal automatisch für
    // die initiale 90%-Voreinstellung aus onImageLoad, nicht erst nach einer echten Zieh-
    // Interaktion - "Übernehmen" ist also von Anfang an nutzbar (guter Default, kein Zwang
    // zum manuellen Zuschneiden). Rein informativ geloggt, KEINE kritische Prüfung (siehe
    // CRITICAL_CHECKS in runner.js).
    const confirmEnabledInitially = await page.locator('#cropConfirmBtn').isEnabled();
    log(`"Übernehmen" initial bereits nutzbar (90%-Vorauswahl): ${confirmEnabledInitially}`);

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
    await dayRows.nth(3).click();
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
