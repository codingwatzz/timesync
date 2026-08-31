// Einstiegspunkt für den E2E-Test. Die eigentliche Logik liegt modular in e2e/ (analog zur
// App-Architektur: core/store/components/hooks/lib). Diese Datei ist bewusst schlank und
// enthält nur noch: den Retry-Mechanismus (2 Versuche, filtert Netzwerk-/Appwrite-Flakes
// heraus) und die Fallback-Fehlerbehandlung.
//
// Sicherheitsprinzip (unverändert): Der gesamte Test spielt sich in einem zufälligen Monat
// weit in der Zukunft ab, damit garantiert NIE echte Nutzerdaten berührt werden.

const fs = require('fs');
const path = require('path');
const { RESULT_FILE } = require('./e2e/config');
const { attemptRun } = require('./e2e/runner');

async function main() {
  try {
    await attemptRun();
    return;
  } catch (e1) {
    console.log(`[e2e] Versuch 1 fehlgeschlagen (${e1.message || e1}). Warte 5s, dann zweiter Versuch…`);
    await new Promise((r) => setTimeout(r, 5000));
    await attemptRun();
    console.log('[e2e] Versuch 2 erfolgreich - Versuch 1 war offenbar ein einmaliger Flake.');
  }
}

main().catch((e) => {
  // attemptRun() schreibt in JEDEM Fehlerpfad bereits die vollständige, detaillierte
  // RESULT_FILE, BEVOR es den Fehler wirft. Hier NICHT nochmal überschreiben, sonst gehen
  // genau die Detaildaten verloren, die für die Fehlersuche gebraucht werden. Nur bei einem
  // wirklich unerwarteten Absturz, bei dem attemptRun selbst noch gar nichts schreiben
  // konnte, greift dieser Fallback.
  const resultPath = path.join(__dirname, RESULT_FILE);
  try {
    JSON.parse(fs.readFileSync(resultPath, 'utf8')); // nur prüfen: existiert schon eine gültige Datei?
  } catch (_) {
    const result = { pass: false, crashed: true, error: String((e && e.stack) || e), timestamp: new Date().toISOString() };
    try { fs.writeFileSync(resultPath, JSON.stringify(result, null, 2)); } catch (_2) {}
  }
  console.error('FAIL (nach 2 Versuchen weiterhin fehlgeschlagen):', e);
  process.exit(1);
});
