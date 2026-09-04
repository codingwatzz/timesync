#!/usr/bin/env node
// Holt ALLE Tageseinträge + Belege (echte Dateien, nicht nur Metadaten) aus Appwrite und
// schreibt sie als eine JSON-Datei. Läuft mit einem Appwrite-Server-API-Key (node-appwrite,
// NICHT das Browser-SDK "appwrite", das die App selbst nutzt) - bewusst rein lesende Scopes
// (siehe README.md), damit ein geleakter Key höchstens Daten offenlegt, aber nichts löschen
// oder verändern kann.
//
// Nutzung: node monthly_backup.js  (liest APPWRITE_BACKUP_API_KEY aus der Umgebung)

const fs = require('fs');
const path = require('path');
const { Client, TablesDB, Storage } = require('node-appwrite');

const config = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: '6a92d8e0002e9b585e39',
  databaseId: '6a92dad20003b47b4a19',
  tableId: 'key-value',
  bucketId: '6a92dd0f003962ea7128',
};

// Identisch zu app/src/store/appwriteId.ts::toAppwriteId - absichtlich hier dupliziert
// (dieses Tool ist ein eigenständiges Node-Projekt ohne Zugriff auf app/src), aber bei einer
// Änderung an der echten Funktion IMMER auch hier nachziehen (siehe CLAUDE_CHECKLIST.md,
// Regel "ein Fix an nur einer Stelle ist kein vollständiger Fix").
function toAppwriteId(key) {
  let id = key.replace(/[^a-zA-Z0-9_]/g, '_');
  id = id.replace(/^_+/, '');
  if (!id) id = 'id' + Date.now();
  if (id.length > 36) id = id.slice(0, 36);
  return id;
}

function pad(n) { return String(n).padStart(2, '0'); }
function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
function isNotFound(e) { return e?.code === 404; }

async function main() {
  const apiKey = process.env.APPWRITE_BACKUP_API_KEY;
  if (!apiKey) {
    console.error('APPWRITE_BACKUP_API_KEY fehlt (siehe tools/backup/README.md).');
    process.exit(1);
  }

  const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId).setKey(apiKey);
  const tablesDB = new TablesDB(client);
  const storage = new Storage(client);

  // Backup-Zeitraum: ab BACKUP_START_MONTH (Standard: erster Monat mit echter App-Nutzung)
  // bis einschließlich dem aktuellen Monat. Bewusst grosszügig (auch zukünftige, noch leere
  // Tage werden versucht und einfach als "nicht gefunden" übersprungen) statt einer
  // fehleranfälligen "bis wohin gibt es wirklich Daten"-Heuristik.
  const startMonth = process.env.BACKUP_START_MONTH || '2026-04';
  const [startYear, startM] = startMonth.split('-').map(Number);
  const now = new Date();
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1;

  const entries = {};
  const receiptIds = new Set();
  let daysChecked = 0;

  let y = startYear;
  let m = startM;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    const nDays = daysInMonth(y, m);
    for (let d = 1; d <= nDays; d++) {
      daysChecked += 1;
      const dateStr = `${y}-${pad(m)}-${pad(d)}`;
      const rowId = toAppwriteId(`entry:${dateStr}`);
      try {
        const row = await tablesDB.getRow({ databaseId: config.databaseId, tableId: config.tableId, rowId });
        const entry = JSON.parse(row.value);
        entries[dateStr] = entry;
        (entry.receiptIds || []).forEach((rid) => receiptIds.add(rid));
      } catch (e) {
        if (!isNotFound(e)) console.error(`⚠ ${dateStr} konnte nicht gelesen werden: ${e.message}`);
      }
    }
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }

  console.log(`${daysChecked} Tage geprüft, ${Object.keys(entries).length} mit Eintrag, ${receiptIds.size} referenzierte Belege.`);

  const receipts = {};
  let receiptFailures = 0;
  for (const rid of receiptIds) {
    const receiptRowId = toAppwriteId(`receipt:${rid}`);
    try {
      const metaRow = await tablesDB.getRow({ databaseId: config.databaseId, tableId: config.tableId, rowId: receiptRowId });
      const meta = JSON.parse(metaRow.value);
      const fileBuffer = await storage.getFileDownload({ bucketId: config.bucketId, fileId: receiptRowId });
      receipts[rid] = {
        name: meta.name,
        mime: meta.mime,
        date: meta.date,
        createdAt: meta.createdAt,
        dataBase64: Buffer.from(fileBuffer).toString('base64'),
      };
    } catch (e) {
      receiptFailures += 1;
      console.error(`⚠ Beleg ${rid} konnte nicht geladen werden: ${e.message}`);
    }
  }

  if (receiptFailures > 0) {
    console.error(`⚠ ${receiptFailures} von ${receiptIds.size} Belegen konnten nicht geladen werden - Backup ist unvollständig, siehe Log oben.`);
  }

  const backup = {
    format: 'zeiterfassung-backup-v1',
    generatedAt: new Date().toISOString(),
    range: { from: startMonth, to: `${endYear}-${pad(endMonth)}` },
    entryCount: Object.keys(entries).length,
    receiptCount: Object.keys(receipts).length,
    receiptFailures,
    entries,
    receipts,
  };

  const outPath = path.join(__dirname, 'backup-output.json');
  fs.writeFileSync(outPath, JSON.stringify(backup));
  const sizeMb = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);
  console.log(`Backup geschrieben: ${outPath} (${sizeMb} MB, ${backup.entryCount} Tage, ${backup.receiptCount} Belege).`);

  // Exit-Code 1 bei unvollständigem Backup, damit ein fehlgeschlagener Beleg-Download nicht
  // stillschweigend als "Backup erfolgreich" durchgeht - der Upload-Schritt läuft trotzdem
  // (besser ein unvollständiges Backup als gar keins), aber der Workflow soll sichtbar rot
  // werden, damit es nicht unbemerkt bleibt.
  if (receiptFailures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('Backup fehlgeschlagen:', e);
  process.exit(1);
});
