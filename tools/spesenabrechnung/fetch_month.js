#!/usr/bin/env node
/**
 * Holt alle Tageseintraege eines Monats direkt aus Appwrite (network-faehig - laeuft nur in
 * einer Umgebung mit Zugriff auf *.appwrite.io, z.B. GitHub Actions, NICHT in Claudes
 * Sandbox, siehe CLAUDE_CHECKLIST.md Abschnitt 0).
 *
 * Nutzung: MONTH=2026-08 node fetch_month.js > monatsdaten.json
 */
const { Client, TablesDB } = require('appwrite');

const config = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: '6a92d8e0002e9b585e39',
  databaseId: '6a92dad20003b47b4a19',
  tableId: 'key-value',
};

function pad(n) { return String(n).padStart(2, '0'); }

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

async function main() {
  const monthArg = process.env.MONTH; // Format "YYYY-MM"
  if (!monthArg || !/^\d{4}-\d{2}$/.test(monthArg)) {
    console.error('Bitte MONTH=YYYY-MM setzen (z.B. MONTH=2026-08 node fetch_month.js)');
    process.exit(1);
  }
  const [year, month] = monthArg.split('-').map(Number);
  const nDays = daysInMonth(year, month);

  const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId);
  const tablesDB = new TablesDB(client);

  const out = { year, month, days: [] };

  for (let day = 1; day <= nDays; day++) {
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    const rowId = `entry_${year}_${pad(month)}_${pad(day)}`;
    try {
      const row = await tablesDB.getRow({ databaseId: config.databaseId, tableId: config.tableId, rowId });
      out.days.push({ date: dateStr, exists: true, entry: JSON.parse(row.value) });
    } catch (e) {
      out.days.push({ date: dateStr, exists: false, error: e?.message });
    }
  }

  // Referenzierte Belege mitliefern (fuer eine spaetere Vollstaendigkeitspruefung/PDF-Merge)
  const allReceiptIds = new Set();
  for (const d of out.days) {
    if (d.exists) (d.entry.receiptIds || []).forEach((rid) => allReceiptIds.add(rid));
  }
  out.receipts = {};
  for (const rid of allReceiptIds) {
    const rowId = 'receipt_' + rid.replace(/[^a-zA-Z0-9_]/g, '_');
    try {
      const row = await tablesDB.getRow({ databaseId: config.databaseId, tableId: config.tableId, rowId });
      const meta = JSON.parse(row.value);
      out.receipts[rid] = { name: meta.name, date: meta.date, createdAt: meta.createdAt };
    } catch (e) {
      out.receipts[rid] = { error: 'Metadaten-Zeile nicht gefunden: ' + e?.message };
    }
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
