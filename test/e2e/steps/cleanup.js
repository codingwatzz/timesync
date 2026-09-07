const { resetDayToDefault } = require('../dayHelpers');

/** Setzt Tag 1, Tag 2 und Tag 3 (Import-/Restore-Testtage) wieder vollständig auf den
 * Ausgangszustand zurück. */
async function cleanupTestDays(page, dayRows) {
  await resetDayToDefault(page, dayRows, 0);
  await resetDayToDefault(page, dayRows, 1);
  await resetDayToDefault(page, dayRows, 2);
}

module.exports = { cleanupTestDays };
