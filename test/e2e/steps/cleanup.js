const { resetDayToDefault } = require('../dayHelpers');

/** Setzt Tag 1, Tag 2, Tag 3 (Import-/Restore-Testtage) und Tag 4 (Foto-Zuschnitt-Test,
 * siehe photoCropFlow.js) wieder vollständig auf den Ausgangszustand zurück. */
async function cleanupTestDays(page, dayRows) {
  await resetDayToDefault(page, dayRows, 0);
  await resetDayToDefault(page, dayRows, 1);
  await resetDayToDefault(page, dayRows, 2);
  await resetDayToDefault(page, dayRows, 3);
}

module.exports = { cleanupTestDays };
