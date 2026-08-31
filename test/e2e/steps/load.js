const { APP_URL, MAX_RETRIES_PAGE_LOAD, RETRY_DELAY_MS } = require('../config');
const { log, sleep } = require('../utils');

/** Lädt die Seite mit Retry-Logik (Netzwerk-/Deploy-Timing kann variieren). */
async function loadPage(page) {
  for (let attempt = 1; attempt <= MAX_RETRIES_PAGE_LOAD; attempt++) {
    log(`Lade Seite (Versuch ${attempt}/${MAX_RETRIES_PAGE_LOAD})…`);
    try {
      await page.goto(`${APP_URL}?cachebust=${Date.now()}`, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(1500);
      return true;
    } catch (e) {
      log(`Ladeversuch fehlgeschlagen: ${e.message}`);
      await sleep(RETRY_DELAY_MS);
    }
  }
  return false;
}

module.exports = { loadPage };
