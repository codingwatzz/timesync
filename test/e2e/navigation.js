// Navigation zum sicheren Testmonat - war im alten Skript ZWEIMAL fast identisch kopiert
// (vor und nach dem Reload). Jetzt eine einzige Funktion, an einer Stelle wartbar.

const { MONTHS_FORWARD } = require('./config');
const { log, sleep } = require('./utils');

/**
 * Navigiert von der aktuellen Ansicht aus MONTHS_FORWARD Monate vorwärts und dann bis zum
 * nächsten Dezember (garantiert Feiertage 25./26.12. für den Test). Muss nach jedem
 * Seitenaufruf/Reload erneut aufgerufen werden, da die App immer im aktuellen Monat startet.
 * @returns {Promise<string>} das Monats-Label, z.B. "Dezember 2032"
 */
async function navigateToSafeTestMonth(page) {
  for (let i = 0; i < MONTHS_FORWARD; i++) {
    await page.click('#nextM');
    await page.waitForTimeout(300);
  }
  await sleep(500);
  for (let i = 0; i < 12; i++) {
    const label = await page.locator('.label').first().innerText();
    if (label.includes('Dezember')) break;
    await page.click('#nextM');
    await page.waitForTimeout(300);
  }
  await sleep(1000);
  const monthLabel = await page.locator('.label').first().innerText();
  log(`Aktueller Testmonat: ${monthLabel}`);
  return monthLabel;
}

/** Wartet nach einem Reload auf ein verlässliches Signal, dass die App (inkl. Appwrite-
 * Verbindung) fertig initialisiert ist, statt eine feste Zeit zu raten. */
async function waitForAppReady(page) {
  await page.waitForFunction(
    () => document.querySelector('.flag.ho, .flag.warn')?.textContent?.includes('Sync'),
    undefined,
    { timeout: 15000 },
  ).catch(() => log('⚠ "Sync"-Statusanzeige nicht innerhalb 15s gefunden.'));
  await sleep(500);
}

module.exports = { navigateToSafeTestMonth, waitForAppReady };
