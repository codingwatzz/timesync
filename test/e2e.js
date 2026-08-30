// Automatisierter End-to-End-Test der live gehosteten Zeiterfassung-App.
// Läuft auf GitHub-Actions-Infrastruktur (nicht in Claudes Sandbox), hat daher normalen
// Internetzugriff auf github.io und cloud.appwrite.io. Ergebnis erscheint im Actions-Log
// und als Screenshots-Artefakt, beides über die GitHub-API abrufbar.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP_URL = 'https://codingwatzz.github.io/timesync/';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 10000;

function log(msg) { console.log(`[e2e] ${msg}`); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  let loaded = false;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(`Lade Seite (Versuch ${attempt}/${MAX_RETRIES})…`);
    try {
      await page.goto(`${APP_URL}?cachebust=${Date.now()}`, { waitUntil: 'networkidle', timeout: 20000 });
      loaded = true;
      break;
    } catch (e) {
      log(`Ladeversuch fehlgeschlagen: ${e.message}`);
      await sleep(RETRY_DELAY_MS);
    }
  }
  if (!loaded) {
    console.error('FAIL: Seite konnte nach mehreren Versuchen nicht geladen werden.');
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(1500); // kurz warten, bis Store initialisiert ist
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_month_view.png') });

  const title = await page.title();
  log(`Titel: ${title}`);

  // Diagnose-Panel öffnen und Inhalt auslesen
  await page.click('#debugBtn');
  await page.waitForSelector('#debugOverlay.show', { timeout: 5000 });
  const debugText = await page.locator('#debugContent').innerText();
  log('--- Diagnose-Inhalt ---');
  log(debugText);
  log('--- Ende Diagnose-Inhalt ---');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_diagnose.png') });
  await page.click('#debugCloseBtn');

  const syncActive = debugText.includes('Appwrite Cloud-Sync (aktiv)');
  log(`Sync aktiv: ${syncActive}`);

  // WICHTIG: Weit in die Zukunft navigieren (24 Monate), damit der Test garantiert NIE auf
  // einen Monat mit echten Nutzerdaten trifft und diese versehentlich überschreibt/löscht.
  log('Navigiere 24 Monate nach vorne, um echte Daten nicht zu gefährden…');
  for (let i = 0; i < 24; i++) {
    await page.click('#nextM');
    await page.waitForTimeout(80);
  }

  // Funktionaler Rundgang-Test: Testeintrag anlegen, neu laden, prüfen, wieder löschen.
  const TEST_NOTE = `E2E-Test ${new Date().toISOString()}`;
  const dayRows = page.locator('.day-row');
  const firstRow = dayRows.first();
  await firstRow.click();
  await page.waitForSelector('.sheet', { timeout: 5000 });

  const hoOn = await page.locator('#hoSwitch').evaluate((el) => el.classList.contains('on'));
  log(`Homeoffice-Default aktiv: ${hoOn}`);

  await page.fill('#f_beschreibung', TEST_NOTE);
  await page.click('#saveBtn');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_after_save.png') });

  // Neu laden, um zu prüfen, ob der Eintrag wirklich aus der Cloud kommt (nicht nur lokaler State).
  // Die App springt nach einem Reload wieder auf den aktuellen Monat zurück -> erneut vorspulen.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 24; i++) {
    await page.click('#nextM');
    await page.waitForTimeout(80);
  }
  await dayRows.first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  const savedNote = await page.locator('#f_beschreibung').inputValue();
  const persistOk = savedNote === TEST_NOTE;
  log(`Persistenz nach Reload OK: ${persistOk} (gelesen: "${savedNote}")`);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_after_reload.png') });

  // Aufräumen: Testeintrag wieder leeren
  await page.fill('#f_beschreibung', '');
  await page.click('#saveBtn');
  await page.waitForTimeout(1000);

  await browser.close();

  log('--- Zusammenfassung ---');
  log(`Konsolenfehler: ${consoleErrors.length}`);
  consoleErrors.forEach((e) => log(`  - ${e}`));
  log(`Seitenfehler (uncaught exceptions): ${pageErrors.length}`);
  pageErrors.forEach((e) => log(`  - ${e}`));
  log(`Sync aktiv: ${syncActive}`);
  log(`Homeoffice-Default aktiv: ${hoOn}`);
  log(`Persistenz-Test bestanden: ${persistOk}`);

  const ok = loaded && syncActive && hoOn && persistOk && pageErrors.length === 0;
  if (!ok) {
    console.error('FAIL: mindestens eine Prüfung ist fehlgeschlagen, siehe Log oben.');
    process.exit(1);
  }
  log('PASS: alle Prüfungen erfolgreich.');
}

main().catch((e) => {
  console.error('FAIL (unerwarteter Fehler):', e);
  process.exit(1);
});
