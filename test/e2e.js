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

// Zeitpunkt VOR dem Laden weiterer Module festhalten - falls schon das Laden selbst
// abstürzt (z.B. Syntaxfehler, fehlende Abhängigkeit in einem der modularen Testdateien),
// muss der Fehler trotzdem sichtbar werden, statt dass eine alte, aber gültige
// Ergebnisdatei von einem früheren Lauf fälschlich als "aktuell" durchgeht.
const runStartTime = new Date().toISOString();

async function main() {
  const { attemptRun } = require('./e2e/runner'); // erst hier laden, damit Ladefehler abgefangen werden
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
  // RESULT_FILE, BEVOR es den Fehler wirft - das NICHT überschreiben, sonst gehen die
  // Detaildaten verloren. ABER: nur wenn die Datei WIRKLICH aus DIESEM Lauf stammt (Zeit-
  // stempel >= runStartTime), nicht bloß irgendeine gültige, aber veraltete Datei von einem
  // früheren Lauf (genau das ist am 01.09.2026 passiert: ein Absturz noch vor dem ersten
  // Schreibversuch blieb unsichtbar, weil die alte Datei "gültig genug" aussah).
  const resultPath = path.join(__dirname, RESULT_FILE);
  let isFreshFromThisRun = false;
  try {
    const existing = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    isFreshFromThisRun = Boolean(existing.timestamp && existing.timestamp >= runStartTime);
  } catch (_) {
    isFreshFromThisRun = false;
  }
  if (!isFreshFromThisRun) {
    const result = { pass: false, crashed: true, error: String((e && e.stack) || e), timestamp: new Date().toISOString() };
    try { fs.writeFileSync(resultPath, JSON.stringify(result, null, 2)); } catch (_2) {}
  }
  console.error('FAIL (nach 2 Versuchen weiterhin fehlgeschlagen):', e);
  process.exit(1);
});
