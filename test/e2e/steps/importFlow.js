const fs = require('fs');
const { log, sleep } = require('../utils');
const { directAppwriteRead, toAppwriteRowId } = require('../appwriteDirectCheck');

/**
 * Importiert einen Testeintrag auf Tag 2 und prüft, ob er ankommt. Mit echter, steigender
 * Wartezeit statt nur einmaligem sofortigen Neuversuch - Appwrite braucht nach dem Schreiben
 * manchmal ein paar Sekunden, bis Lesezugriffe zuverlässig den neuen Stand zeigen
 * ("Eventual Consistency", am 31.08.2026 per direktem SDK-Vergleich nachgewiesen).
 *
 * WICHTIG (04.09.2026): Vorher 6 Versuche mit Backoff bis max. 12s/Versuch (~42s Gesamtbudget)
 * - reichte in der Praxis gelegentlich nicht aus, `importWorked` schlug dann fehl und ließ den
 * GESAMTEN E2E-Lauf rot erscheinen (importWorked steht in runner.js::CRITICAL_CHECKS), obwohl
 * alle anderen 15 Prüfungen bestanden. Ein rotes X soll aber zuverlässig "hier ist wirklich
 * etwas kaputt" bedeuten, nicht gelegentlich "Appwrite war nur kurz langsam". Fix: mehr Versuche
 * (10 statt 6), höheres Backoff-Limit (Deckel bei 20s statt 12s, macht ~140s statt ~42s
 * Gesamtbudget), UND zusätzlich ein direkter Appwrite-Read (an App/Browser-Cache vorbei,
 * dieselbe Technik wie appwriteDirectCheck.js) sobald die UI-Prüfung mehrfach erfolglos blieb -
 * das unterscheidet klar "Daten sind schon da, nur die UI hinkt hinterher" (= reine
 * Konsistenz-Verzögerung, weiter warten lohnt sich) von "Daten sind wirklich noch nicht da"
 * (= evtl. ein echtes Problem). Ändert NICHT das Pass/Fail-Kriterium selbst (das bleibt an der
 * UI-Sicht, weil genau die für echte Nutzer zählt) - liefert nur bessere Diagnose fürs Log,
 * falls es am Ende doch fehlschlägt.
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
    undefined,
    { timeout: 10000 },
  ).catch(() => log('⚠ Import-Toast nicht gesehen.'));
  // Die App zeigt den Toast erst NACH dem reload() der Monatsdaten (siehe App.tsx) - trotzdem
  // hier zusätzlich explizit auf den sichtbaren Text warten, statt uns nur auf den Toast zu
  // verlassen.
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.day-mid .desc'))
      .some((el) => el.textContent?.includes('Import-Test-Eintrag')),
    undefined,
    { timeout: 10000 },
  ).catch(() => log('⚠ Importierter Eintrag nach 10s noch nicht in Monatsansicht sichtbar.'));

  const day2Row = dayRows.nth(1);
  await day2Row.click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  let importedDesc = await page.locator('#f_beschreibung').inputValue();

  const MAX_ATTEMPTS = 10;
  const BACKOFF_CAP_MS = 20000;
  const DIRECT_CHECK_AB_VERSUCH = 3; // erst ab hier lohnt sich der zusätzliche Appwrite-Read
  const day2RowId = toAppwriteRowId(`entry:${importDateKey}`);
  let groundTruthSeenPresent = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && importedDesc !== 'Import-Test-Eintrag'; attempt++) {
    const waitMs = Math.min(attempt * 3000, BACKOFF_CAP_MS);
    log(`⚠ Beschreibung noch nicht korrekt (Versuch ${attempt}/${MAX_ATTEMPTS}), warte ${waitMs / 1000}s und versuche erneut…`);

    if (attempt >= DIRECT_CHECK_AB_VERSUCH && !groundTruthSeenPresent) {
      const direct = await directAppwriteRead(page, day2RowId, 'Import Tag 2');
      if (direct.found && direct.beschreibung === 'Import-Test-Eintrag') {
        groundTruthSeenPresent = true;
        log('→ Daten sind laut direktem Appwrite-Read bereits korrekt geschrieben - reine UI-/Cache-Verzögerung, kein Datenproblem. Warte weiter.');
      } else if (direct.found) {
        log(`→ Zeile existiert in Appwrite, aber mit anderem Inhalt (beschreibung="${direct.beschreibung}") - ungewöhnlich, evtl. ein echtes Problem statt reiner Verzögerung.`);
      } else {
        log('→ Laut direktem Appwrite-Read noch NICHT vorhanden - kann reine Verzögerung sein (Bulk-Import-Schreibvorgang noch nicht abgeschlossen) oder ein echtes Problem, falls das bis zum letzten Versuch so bleibt.');
      }
    }

    await page.click('#closeBtn').catch(() => {});
    await sleep(waitMs);
    await day2Row.click();
    await page.waitForSelector('.sheet', { timeout: 5000 });
    importedDesc = await page.locator('#f_beschreibung').inputValue();
  }
  results.importWorked = importedDesc === 'Import-Test-Eintrag';
  results.importedDescActual = importedDesc;
  results.importGroundTruthConfirmed = groundTruthSeenPresent;
  log(`Import erfolgreich (Tag 2 zeigt importierten Eintrag): ${results.importWorked} (gelesen: "${importedDesc}")`);
  if (!results.importWorked && groundTruthSeenPresent) {
    log('⚠⚠ WICHTIG: Appwrite hatte die korrekten Daten (direkt bestätigt), die UI zeigte sie aber selbst nach vollem Wartebudget nicht - das ist KEINE reine Konsistenz-Verzögerung mehr, sondern deutet auf einen echten UI-/Reload-Bug hin. Nicht als bekannte Flakigkeit abtun.');
  }

  return results;
}

module.exports = { checkImportFlow };
