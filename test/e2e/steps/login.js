const { log } = require('../utils');

/**
 * Loggt sich in die App ein - seit 04.09.2026 verbindlich für JEDEN Appwrite-Zugriff (siehe
 * AuthGate.tsx: kein Login = kein Store, egal was die Appwrite-Berechtigungen selbst sagen).
 * Zugangsdaten kommen NUR aus Umgebungsvariablen (APPWRITE_EMAIL/APPWRITE_PASSWORD, als
 * GitHub-Actions-Secrets hinterlegt) - niemals Klartext im Code, niemals geloggt.
 */
async function login(page) {
  const email = process.env.APPWRITE_EMAIL;
  const password = process.env.APPWRITE_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'APPWRITE_EMAIL/APPWRITE_PASSWORD nicht gesetzt (GitHub-Actions-Secrets fehlen - siehe CLAUDE_CHECKLIST.md, Abschnitt Login).',
    );
  }

  // #debugBtn gehört zur DiagnosePanel, die Teil von <App/> ist und erst NACH erfolgreichem
  // Login gerendert wird (siehe AuthGate.tsx) - zuverlässiger und schnellerer Indikator als
  // auf Monatsdaten zu warten, die erst asynchron nachladen.
  const alreadyPastLogin = await page.locator('#debugBtn').count() > 0;
  if (alreadyPastLogin) {
    log('Bereits eingeloggt (Session im Browser-Kontext vorhanden) - kein Login-Formular nötig.');
    return true;
  }

  log('Fülle Login-Formular aus…');
  await page.fill('#f_loginEmail', email);
  await page.fill('#f_loginPassword', password);
  await page.click('#loginBtn');

  try {
    await page.waitForSelector('#debugBtn', { timeout: 15000 });
    log('Login erfolgreich.');
    return true;
  } catch {
    const errorText = await page.locator('#loginError').textContent().catch(() => null);
    log(`⚠ Login fehlgeschlagen. Fehlermeldung im UI: ${errorText ?? '(keine sichtbar)'}`);
    return false;
  }
}

module.exports = { login };
