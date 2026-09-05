/** Öffnet das Diagnose-Panel (seit 04.09.2026 hinter dem Zahnrad-Menü, nicht mehr direkt
 * über einen eigenen schwebenden Button erreichbar), liest den Textinhalt aus, schließt
 * alles wieder. */
async function readDiagnosePanel(page) {
  await page.click('#settingsBtn');
  await page.waitForSelector('.settings-dropdown', { timeout: 5000 });
  await page.click('.settings-dropdown >> text=Diagnose');
  await page.waitForSelector('#debugOverlay.show', { timeout: 5000 });
  const text = await page.locator('#debugContent').innerText();
  await page.click('#debugCloseBtn');
  return text;
}

module.exports = { readDiagnosePanel };
