const { log } = require('../utils');

/** Prüft Wochenend-Kacheln und Feiertags-Erkennung (25./26. Dezember). */
async function checkWeekendsAndHolidays(page, dayRows) {
  const weekendCount = await page.locator('.day-row.weekend').count();
  log(`Wochenend-Kacheln gefunden: ${weekendCount}`);

  const rowCount = await dayRows.count();
  let day25Tab = '';
  let day26Tab = '';
  for (let i = 0; i < rowCount; i++) {
    const numText = await dayRows.nth(i).locator('.day-date .num').innerText();
    if (numText.trim() === '25') day25Tab = await dayRows.nth(i).locator('.tab').getAttribute('class');
    if (numText.trim() === '26') day26Tab = await dayRows.nth(i).locator('.tab').getAttribute('class');
  }
  const holiday25Detected = day25Tab.includes('F');
  const holiday26Detected = day26Tab.includes('F');
  log(`Feiertag 25.12. erkannt: ${holiday25Detected}, 26.12.: ${holiday26Detected}`);

  return { weekendCount, holiday25Detected, holiday26Detected };
}

module.exports = { checkWeekendsAndHolidays };
