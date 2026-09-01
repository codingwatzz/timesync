// Setzt einen Tag auf den Ausgangszustand zurück (leer, Homeoffice an, kein Reiseabschnitt).
// WICHTIG (aus zwei echten Bugs am 30./31.08.2026 gelernt): Reiseabschnitt-Felder MÜSSEN vor
// dem Zurückschalten von Homeoffice geleert werden (der Abschnitt verschwindet sonst), UND
// Typ 'A' + Homeoffice AUS müssen zuerst gesetzt werden, damit der Abschnitt beim Leeren
// überhaupt sichtbar ist. Diese Reihenfolge war zweimal an unterschiedlichen Stellen im alten
// monolithischen Skript vergessen worden - als eigene Funktion jetzt nur an einer Stelle
// wartbar und für Tag 1 UND Tag 2 identisch wiederverwendbar.

const { sleep } = require('./utils');

/**
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} dayRows - Locator für alle .day-row Elemente
 * @param {number} rowIndex - 0-basiert (0 = Tag 1, 1 = Tag 2, ...)
 */
async function resetDayToDefault(page, dayRows, rowIndex) {
  // Defensiv: falls von einem vorherigen Schritt noch ein Sheet offen ist (z.B. durch
  // mehrfaches Öffnen/Schließen bei der Import-Konsistenz-Wartelogik), erst schließen -
  // sonst kann ein zweites, gestapeltes Sheet Klicks abfangen ("intercepts pointer events",
  // beobachtet am 01.09.2026).
  if (await page.locator('.sheet-backdrop').count() > 0) {
    await page.click('#closeBtn').catch(() => {});
    await sleep(400);
  }

  await dayRows.nth(rowIndex).click();
  await page.waitForSelector('.sheet', { timeout: 5000 });

  // Schritt 1: Typ 'A' setzen + Homeoffice AUS, damit der Reiseabschnitt sichtbar wird.
  await page.click('#typPick button[data-t="A"]');
  const hoOnAtStart = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
  if (hoOnAtStart) await page.click('#hoSwitch');
  await sleep(150);

  // Schritt 2: alle Felder leeren (Reiseabschnitt jetzt sichtbar).
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
  const fruehstueckActive = await page.locator('.yesno[data-field="fr"] button')
    .evaluate((el) => el.classList.contains('active')).catch(() => false);
  if (fruehstueckActive) await page.click('.yesno[data-field="fr"] button');

  // Schritt 3: erst JETZT Homeoffice zurück auf Standard (an) - der Abschnitt darf beim
  // Leeren in Schritt 2 nicht schon wieder verschwunden sein.
  const hoOnNow = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
  if (!hoOnNow) await page.click('#hoSwitch');

  await page.click('#saveBtn');
  await sleep(600);
}

module.exports = { resetDayToDefault };
