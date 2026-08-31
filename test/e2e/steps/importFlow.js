const fs = require('fs');
const { log, sleep } = require('../utils');

/**
 * Importiert einen Testeintrag auf Tag 2 und prüft, ob er ankommt. Mit echter, steigender
 * Wartezeit statt nur einmaligem sofortigen Neuversuch - Appwrite braucht nach dem Schreiben
 * manchmal ein paar Sekunden, bis Lesezugriffe zuverlässig den neuen Stand zeigen
 * ("Eventual Consistency", am 31.08.2026 per direktem SDK-Vergleich nachgewiesen).
 */
async function checkImportFlow(page, dayRows, { testYear, testImportPath }) {
  const results = {};
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
    { timeout: 10000 },
  ).catch(() => log('⚠ Import-Toast nicht gesehen.'));
  // Die App zeigt den Toast erst NACH dem reload() der Monatsdaten (siehe App.tsx) - trotzdem
  // hier zusätzlich explizit auf den sichtbaren Text warten, statt uns nur auf den Toast zu
  // verlassen.
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.day-mid .desc'))
      .some((el) => el.textContent?.includes('Import-Test-Eintrag')),
    { timeout: 10000 },
  ).catch(() => log('⚠ Importierter Eintrag nach 10s noch nicht in Monatsansicht sichtbar.'));

  const day2Row = dayRows.nth(1);
  await day2Row.click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  let importedDesc = await page.locator('#f_beschreibung').inputValue();

  for (let attempt = 1; attempt <= 6 && importedDesc !== 'Import-Test-Eintrag'; attempt++) {
    log(`⚠ Beschreibung noch nicht korrekt (Versuch ${attempt}), warte ${attempt * 2}s und versuche erneut…`);
    await page.click('#closeBtn').catch(() => {});
    await sleep(attempt * 2000);
    await day2Row.click();
    await page.waitForSelector('.sheet', { timeout: 5000 });
    importedDesc = await page.locator('#f_beschreibung').inputValue();
  }
  results.importWorked = importedDesc === 'Import-Test-Eintrag';
  results.importedDescActual = importedDesc;
  log(`Import erfolgreich (Tag 2 zeigt importierten Eintrag): ${results.importWorked} (gelesen: "${importedDesc}")`);

  return results;
}

module.exports = { checkImportFlow };
