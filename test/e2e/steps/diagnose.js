/** Öffnet das Diagnose-Panel, liest den Textinhalt aus, schließt es wieder. */
async function readDiagnosePanel(page) {
  await page.click('#debugBtn');
  await page.waitForSelector('#debugOverlay.show', { timeout: 5000 });
  const text = await page.locator('#debugContent').innerText();
  await page.click('#debugCloseBtn');
  return text;
}

module.exports = { readDiagnosePanel };
