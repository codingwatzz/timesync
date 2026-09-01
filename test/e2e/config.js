// Zentrale Konfiguration - eine Quelle der Wahrheit für alle Test-Module.
// Analog zur App-Architektur (core/types.ts): Konfiguration getrennt von Logik.

const path = require('path');

const APP_URL = process.env.APP_URL || 'https://codingwatzz.github.io/timesync/';
const RESULT_FILE = process.env.RESULT_FILE || 'last-result.json';

// Zufälliger Versatz sollte garantieren, dass JEDER Testlauf einen Zeitraum trifft, den kein
// anderer Lauf je zuvor berührt hat. Der ursprüngliche Bereich (60-84 Monate) tat das NICHT
// wirklich: navigateToSafeTestMonth() rundet den gewählten Startpunkt immer auf den NÄCHSTEN
// Dezember auf (garantiert Feiertage 25./26.12. für den Test) - bei nur 24 möglichen
// Startwerten bleiben dadurch lediglich 3 erreichbare Ziel-Dezember übrig (z.B. 2031/2032/2033).
// Bei mehreren Testläufen kurz hintereinander (z.B. durch parallele Sitzungen oder manuelle
// Wiederholungen) kollidieren die dadurch mit spürbarer Wahrscheinlichkeit auf demselben Tag -
// genau das hat am 01.09.2026 zu einer verschmutzten Testzeile geführt (siehe Chat-Verlauf).
// Fix: Bereich auf 60-180 Monate (5-15 Jahre) erweitert - das ergibt rund 10 statt 3 erreichbare
// Ziel-Dezember und senkt die Kollisionswahrscheinlichkeit deutlich, ohne die Feiertags-
// Garantie aufzugeben oder die Navigationszeit (jeder Monat kostet einen Klick + 300ms Wartezeit
// in navigateToSafeTestMonth) unnötig in die Höhe zu treiben. Über MONTHS_FORWARD env-Variable
// weiterhin auf einen festen Wert überschreibbar (z.B. für gezieltes Debugging).
const MONTHS_FORWARD = Number(process.env.MONTHS_FORWARD || (60 + Math.floor(Math.random() * 120)));

const MAX_RETRIES_PAGE_LOAD = 10;
const RETRY_DELAY_MS = 10000;

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

// Appwrite-Zugangsdaten NUR für die Diagnose-Funktion (direkter, unabhängiger Read an App und
// Browser-Cache vorbei) - dieselben Werte wie in app/src/main.tsx, hier dupliziert, weil das
// Testskript unabhängig vom App-Build laufen muss.
const APPWRITE_CONFIG = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: '6a92d8e0002e9b585e39',
  databaseId: '6a92dad20003b47b4a19',
  tableId: 'key-value',
};

module.exports = {
  APP_URL, RESULT_FILE, MONTHS_FORWARD,
  MAX_RETRIES_PAGE_LOAD, RETRY_DELAY_MS, SCREENSHOT_DIR, APPWRITE_CONFIG,
};
