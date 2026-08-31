// Prüft echtes Offline-Verhalten der PWA: Seite einmal online laden (Service Worker
// installiert + cacht alles), dann Netzwerk kappen und neu laden - die App-Hülle inkl.
// des tatsächlichen JS-Codes muss trotzdem funktionieren (nicht nur eine leere HTML-Seite).

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP_URL = process.env.APP_URL || 'https://codingwatzz.github.io/timesync/';
const RESULT_FILE = process.env.RESULT_FILE || 'last-result-offline.json';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-offline');

function log(msg) { console.log(`[offline-test] ${msg}`); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = {};
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  // ---------- 1. Einmal ONLINE laden, damit Service Worker installiert + cacht ----------
  let onlineLoaded = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await page.goto(`${APP_URL}?cachebust=${Date.now()}`, { waitUntil: 'networkidle', timeout: 20000 });
      onlineLoaded = true;
      break;
    } catch (e) {
      log(`Online-Ladeversuch ${attempt} fehlgeschlagen: ${e.message}`);
      await sleep(5000);
    }
  }
  results.onlineLoaded = onlineLoaded;
  if (!onlineLoaded) {
    results.pass = false;
    results.error = 'Konnte Seite nicht einmal online laden - Voraussetzung für Offline-Test nicht erfüllt.';
    fs.writeFileSync(path.join(__dirname, RESULT_FILE), JSON.stringify(results, null, 2));
    await browser.close();
    console.error('FAIL:', results.error);
    process.exit(1);
  }

  // Warten, bis der Service Worker wirklich aktiv ist und alles gecacht hat
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller !== null,
    undefined,
    { timeout: 15000 },
  ).catch(() => log('⚠ Service Worker war nach 15s noch nicht aktiv (controller null).'));
  await page.waitForTimeout(3000); // Puffer, damit die opportunistische Cache-Befüllung abschließt
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_online.png') });

  const swActive = await page.evaluate(() => navigator.serviceWorker?.controller !== null);
  results.serviceWorkerActive = swActive;
  log(`Service Worker aktiv: ${swActive}`);

  // ---------- 2. Netzwerk kappen und neu laden ----------
  await context.setOffline(true);
  log('Netzwerk gekappt (offline). Lade Seite neu…');

  let offlineReloadWorked = false;
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    offlineReloadWorked = true;
  } catch (e) {
    log(`⚠ Offline-Reload-Fehler: ${e.message}`);
  }
  results.offlineReloadCompleted = offlineReloadWorked;
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_offline_reload.png') });

  // ---------- 3. Prüfen: zeigt die Seite noch echten Inhalt (nicht nur weiß/leer)? ----------
  const title = await page.title().catch(() => '');
  results.titleAfterOffline = title;

  const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  results.hasVisibleContent = bodyText.trim().length > 0;
  log(`Sichtbarer Text-Inhalt nach Offline-Reload vorhanden: ${results.hasVisibleContent}`);

  // #app ist das React-Root - wenn React gar nicht geladen/gerendert hat, bleibt es leer
  const appRootHtml = await page.evaluate(() => document.getElementById('app')?.innerHTML || '').catch(() => '');
  results.appRootRendered = appRootHtml.length > 100; // grobe Schwelle: "irgendwas Sinnvolles" gerendert
  log(`App-Root hat Inhalt gerendert: ${results.appRootRendered} (${appRootHtml.length} Zeichen)`);

  results.headerVisible = await page.locator('h1').isVisible().catch(() => false);
  log(`Header/Titel sichtbar: ${results.headerVisible}`);

  await context.setOffline(false); // aufräumen
  await browser.close();

  results.pageErrors = pageErrors;
  results.timestamp = new Date().toISOString();
  results.pass =
    results.onlineLoaded &&
    results.serviceWorkerActive &&
    results.offlineReloadCompleted &&
    results.hasVisibleContent &&
    results.appRootRendered &&
    results.headerVisible;

  fs.writeFileSync(path.join(__dirname, RESULT_FILE), JSON.stringify(results, null, 2));

  log('--- Zusammenfassung ---');
  Object.entries(results).forEach(([k, v]) => {
    if (Array.isArray(v)) return;
    log(`${k}: ${v}`);
  });

  if (!results.pass) {
    console.error('FAIL: Offline-/PWA-Verhalten funktioniert nicht wie erwartet.');
    process.exit(1);
  }
  log('PASS: App funktioniert auch offline (Service Worker cacht korrekt).');
}

main().catch((e) => {
  const result = { pass: false, crashed: true, error: String((e && e.stack) || e), timestamp: new Date().toISOString() };
  try { fs.writeFileSync(path.join(__dirname, RESULT_FILE), JSON.stringify(result, null, 2)); } catch (_) {}
  console.error('FAIL (unerwarteter Fehler):', e);
  process.exit(1);
});
