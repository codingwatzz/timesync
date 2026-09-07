const fs = require('fs');
const { log, sleep, MINIMAL_PDF } = require('../utils');

/**
 * Prüft den neuen Rohdaten-Backup-Restore (07.09.2026): importiert eine Datei im Format
 * "zeiterfassung-backup-v1" mit einem Eintrag UND einem echten Beleg, bestätigt den
 * Import-Dialog, und prüft danach, dass (1) der Eintrag mit den richtigen Feldern ankommt,
 * (2) der Beleg als echte Datei wiederhergestellt wurde UND sich öffnen lässt (nicht nur
 * "irgendeine Datei", sondern tatsächlich ladbar - genau die Kombination, in der am
 * 07.09.2026 zwei kritische Bugs steckten: Datei-Korruption beim Download UND fehlendes
 * credentials:'include').
 */
async function checkRestoreFlow(page, dayRows, { testYear, testImportPath }) {
  const results = {};
  // Defensiv: falls ein vorheriger Schritt sein Sheet nicht geschlossen hat, blockiert das
  // offene Overlay sonst jeden weiteren Klick (real aufgetreten 07.09.2026).
  await page.click('#closeBtn').catch(() => {});
  await sleep(300);

  const restoreDateKey = `${testYear}-12-03`;
  const restoreRid = 'e2e-restore-rid';
  const pdfBase64 = Buffer.from(MINIMAL_PDF).toString('base64');

  const backupPayload = {
    format: 'zeiterfassung-backup-v1',
    generatedAt: new Date().toISOString(),
    year: Number(testYear),
    month: 12,
    entries: {
      [restoreDateKey]: {
        typ: 'A', typManuell: true, ho: false,
        start: '08:00', ende: '16:00', pause: '30', start2: '', ende2: '', pause2: '',
        beschreibung: 'Restore-Test-Eintrag', km: '', transport: '25,50', hotel: '',
        bewirtung: '', sonstiges: '', reiseland: 'Deutschland', reiseart: 'Abreisetag',
        fr: false, mi: false, ab: false, receiptIds: [restoreRid],
      },
    },
    receipts: {
      [restoreRid]: {
        name: 'restore-beleg.pdf', mime: 'application/pdf', createdAt: Date.now(),
        date: restoreDateKey, feld: 'transport',
        dataUrl: `data:application/pdf;base64,${pdfBase64}`,
      },
    },
  };
  fs.writeFileSync(testImportPath, JSON.stringify(backupPayload));

  await page.setInputFiles('#importFileInput', testImportPath);
  await page.waitForSelector('#importConfirmDialog', { timeout: 5000 });
  const dialogText = await page.locator('#importConfirmDialog').textContent().catch(() => '');
  results.restoreDialogMentionsReceipts = /Beleg/.test(dialogText || '');
  await page.click('#importConfirmBtn');
  await page.waitForFunction(
    () => document.getElementById('toast')?.textContent?.includes('wiederhergestellt'),
    undefined,
    { timeout: 15000 },
  ).catch(() => log('⚠ "wiederhergestellt"-Toast nicht gesehen.'));
  await sleep(1000);

  const day3Row = dayRows.nth(2);
  await day3Row.click();
  await page.waitForSelector('.sheet', { timeout: 5000 });

  const beschreibung = await page.locator('#f_beschreibung').inputValue();
  const transport = await page.locator('#f_transport').inputValue();
  results.restoreWorked = beschreibung === 'Restore-Test-Eintrag' && Number(transport) === 25.5;
  log(`Restore: Eintrag korrekt wiederhergestellt: ${results.restoreWorked} (beschreibung="${beschreibung}", transport="${transport}")`);

  await page.waitForSelector('.receipt-item', { timeout: 5000 }).catch(() => {});
  const receiptCount = await page.locator('.receipt-item').count();
  results.restoreReceiptPresent = receiptCount === 1;
  log(`Restore: Beleg als Zeile vorhanden: ${results.restoreReceiptPresent}`);

  if (receiptCount === 1) {
    await page.locator('.receipt-item').first().click();
    await sleep(1200);
    const toastText = await page.locator('#toast').textContent().catch(() => '');
    results.restoreReceiptOpenedWithoutError =
      !toastText.includes('Beleg konnte nicht geladen werden') &&
      !toastText.includes('Beleg konnte nicht geöffnet werden');
    log(`Restore: wiederhergestellter Beleg ohne Fehler geöffnet: ${results.restoreReceiptOpenedWithoutError} (Toast: "${toastText}")`);
  } else {
    results.restoreReceiptOpenedWithoutError = false;
  }

  await page.click('#closeBtn').catch(() => {});
  await sleep(500);

  return results;
}

module.exports = { checkRestoreFlow };
