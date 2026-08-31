// Zentrale Konfiguration - eine Quelle der Wahrheit für alle Test-Module.
// Analog zur App-Architektur (core/types.ts): Konfiguration getrennt von Logik.

const path = require('path');

const APP_URL = process.env.APP_URL || 'https://codingwatzz.github.io/timesync/';
const RESULT_FILE = process.env.RESULT_FILE || 'last-result.json';

// Zufälliger Versatz (60-84 Monate) statt fester Wert: garantiert, dass JEDER Testlauf einen
// Zeitraum trifft, den kein anderer Lauf je zuvor berührt hat - schließt "angesammelte
// Altlasten im gemeinsam genutzten Testbereich" strukturell aus. Über MONTHS_FORWARD env-
// Variable weiterhin auf einen festen Wert überschreibbar (z.B. für gezieltes Debugging).
const MONTHS_FORWARD = Number(process.env.MONTHS_FORWARD || (60 + Math.floor(Math.random() * 24)));

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
