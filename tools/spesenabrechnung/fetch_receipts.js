#!/usr/bin/env node
/**
 * Laedt die tatsaechlichen Beleg-PDF-Dateien aus Appwrite Storage herunter (network-faehig -
 * laeuft nur in einer Umgebung mit Zugriff auf *.appwrite.io, z.B. GitHub Actions, NICHT in
 * Claudes Sandbox, siehe CLAUDE_CHECKLIST.md Abschnitt 0).
 *
 * Nutzung: MONTH=2026-08 node fetch_receipts.js
 * Erwartet monatsdaten.json (von fetch_month.js) im aktuellen Verzeichnis.
 * Schreibt jede Beleg-Datei nach receipts/<rid>.pdf und einen manifest.json mit
 * rid -> {file, name, date, ok, error}.
 */
const fs = require('fs');
const path = require('path');
const { Client, Storage } = require('appwrite');

const config = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: '6a92d8e0002e9b585e39',
  bucketId: '6a92dd0f003962ea7128',
};

function toAppwriteId(key) {
  let id = key.replace(/[^a-zA-Z0-9_]/g, '_');
  id = id.replace(/^_+/, '');
  if (!id) id = 'id' + Date.now();
  if (id.length > 36) id = id.slice(0, 36);
  return id;
}

async function main() {
  const dataPath = process.env.DATA_PATH || 'monatsdaten.json';
  if (!fs.existsSync(dataPath)) {
    console.error(`${dataPath} nicht gefunden - zuerst fetch_month.js ausfuehren`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const receiptIds = Object.keys(data.receipts || {});
  if (receiptIds.length === 0) {
    console.log('Keine Belege referenziert - nichts herunterzuladen.');
    fs.writeFileSync('manifest.json', JSON.stringify({}, null, 2));
    return;
  }

  const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId);
  const storage = new Storage(client);

  fs.mkdirSync('receipts', { recursive: true });
  const manifest = {};

  for (const rid of receiptIds) {
    const fileId = toAppwriteId(`receipt:${rid}`);
    const meta = data.receipts[rid];
    try {
      const url = storage.getFileDownload({ bucketId: config.bucketId, fileId });
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      const outPath = path.join('receipts', `${rid}.pdf`);
      fs.writeFileSync(outPath, buf);
      manifest[rid] = { file: outPath, name: meta?.name, date: meta?.date, ok: true };
      console.log(`OK: ${rid} (${meta?.name}, ${buf.length} Bytes) -> ${outPath}`);
    } catch (e) {
      manifest[rid] = { ok: false, error: e?.message, name: meta?.name, date: meta?.date };
      console.error(`FEHLER bei ${rid} (${meta?.name}): ${e?.message}`);
    }
  }

  fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
  const failed = Object.values(manifest).filter((m) => !m.ok).length;
  console.log(`\n${receiptIds.length - failed}/${receiptIds.length} Belege erfolgreich heruntergeladen.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
