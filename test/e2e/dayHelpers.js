// Setzt einen Tag auf den Ausgangszustand zurück (leer, Homeoffice an, kein Reiseabschnitt,
// KEINE Belege). WICHTIG (aus drei echten Bugs am 30./31.08. und 01.09.2026 gelernt):
// Reiseabschnitt-Felder MÜSSEN vor dem Zurückschalten von Homeoffice geleert werden (der
// Abschnitt verschwindet sonst), UND Typ 'A' + Homeoffice AUS müssen zuerst gesetzt werden,
// damit der Abschnitt beim Leeren überhaupt sichtbar ist. Diese Reihenfolge war zweimal an
// unterschiedlichen Stellen im alten monolithischen Skript vergessen worden - als eigene
// Funktion jetzt nur an einer Stelle wartbar und für Tag 1 UND Tag 2 identisch wiederverwendbar.
//
// DRITTER Bug (01.09.2026): diese Funktion leerte bisher NUR die Formularfelder, nie
// hochgeladene Belege. Jeder Testlauf, der einen Beleg hochlädt (fillAndSaveEntry.js),
// hinterließ ihn dauerhaft am Testtag - über viele Läufe sammelten sich so mehrere Belege an
// (mal 4, mal 10), und die strikten "genau 1 Beleg"-Prüfungen in reloadAndVerify.js schlugen
// dann fehl, obwohl der eigentliche Upload/die App fehlerfrei funktionierte. Fix:
// clearAllReceipts() wird jetzt IMMER mit aufgerufen, sowohl beim defensiven Vor-Reset als
// auch beim Aufräumen am Testende - garantiert einen wirklich leeren Ausgangszustand.

const { sleep } = require('./utils');

/**
 * Löscht ALLE aktuell im geöffneten Sheet angezeigten Belege (nicht nur den letzten). Setzt
 * voraus, dass das Sheet für den betreffenden Tag bereits offen ist.
 * @param {import('playwright').Page} page
 */
async function clearAllReceipts(page) {
  const MAX_ITERATIONS = 20; // Sicherheitsnetz gegen eine Endlosschleife bei einem echten Fehler
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const count = await page.locator('.receipt-item').count();
    if (count === 0) return;
    try {
      await page.click('.receipt-item .del', { timeout: 5000 });
      await page.waitForFunction(
        (prevCount) => document.querySelectorAll('.receipt-item').length < prevCount,
        count,
        { timeout: 5000 },
      );
    } catch (e) {
      // Ein einzelner fehlgeschlagener Löschversuch soll den ganzen Testlauf nicht abbrechen -
      // beim nächsten Durchlauf dieser Schleife wird es erneut versucht, bis MAX_ITERATIONS.
      await sleep(300);
    }
  }
}

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

  // Belege IMMER zuerst vollständig entfernen - unabhängig davon, wie viele sich über
  // vorherige Testläufe angesammelt haben könnten (siehe Kommentar oben).
  await clearAllReceipts(page);

  // Schritt 1: Typ 'A' setzen + Homeoffice AUS, damit der Reiseabschnitt sichtbar wird.
  await page.click('#typPick button[data-t="A"]');
  const hoOnAtStart = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
  if (hoOnAtStart) await page.click('#hoSwitch');
  await sleep(150);

  // Schritt 2: alle Felder leeren (Reiseabschnitt jetzt sichtbar).
  await page.fill('#f_beschreibung', '');
  await page.fill('#f_start', '');
  await page.fill('#f_ende', '');
  // '#f_pause' ist ein <select> (Minuten-Dropdown, siehe pauseOptionsFor), kein Texteingabe-
  // feld - page.fill() wirft hier einen Fehler ("Element is not an <input>..."). '0' ist der
  // App-eigene Standardwert fuer "keine Pause" (siehe DetailSheet.tsx: value={entry.pause ||
  // '0'}).
  await page.selectOption('#f_pause', '0');
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

module.exports = { resetDayToDefault, clearAllReceipts };
