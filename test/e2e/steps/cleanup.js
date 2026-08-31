const { resetDayToDefault } = require('../dayHelpers');

/** Setzt Tag 1 und Tag 2 wieder vollständig auf den Ausgangszustand zurück. */
async function cleanupTestDays(page, dayRows) {
  await resetDayToDefault(page, dayRows, 0);
  await resetDayToDefault(page, dayRows, 1);
}

module.exports = { cleanupTestDays };
