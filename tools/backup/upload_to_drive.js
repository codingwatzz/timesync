#!/usr/bin/env node
// Lädt tools/backup/backup-output.json (von monthly_backup.js erzeugt) zu Google Drive hoch,
// über einen Service-Account statt einem persönlichen Google-Konto - kein OAuth-Login-Flow,
// kein Refresh-Token, der irgendwo dauerhaft gespeichert werden müsste. Der Service-Account
// braucht dafür Schreibzugriff auf GENAU EINEN, vorher manuell geteilten Ordner (Scope
// "drive.file" - kann NUR Dateien lesen/ändern, die er selbst angelegt hat, nicht den Rest von
// Google Drive) - siehe README.md für die einmalige Einrichtung.

const fs = require('fs');
const path = require('path');
const { drive } = require('@googleapis/drive');
const { GoogleAuth } = require('google-auth-library');

async function main() {
  const keyJson = process.env.GDRIVE_SERVICE_ACCOUNT_JSON;
  const folderId = process.env.GDRIVE_BACKUP_FOLDER_ID;
  if (!keyJson || !folderId) {
    console.error('GDRIVE_SERVICE_ACCOUNT_JSON und/oder GDRIVE_BACKUP_FOLDER_ID fehlen (siehe tools/backup/README.md).');
    process.exit(1);
  }

  const backupPath = path.join(__dirname, 'backup-output.json');
  if (!fs.existsSync(backupPath)) {
    console.error(`${backupPath} existiert nicht - monthly_backup.js muss vorher gelaufen sein.`);
    process.exit(1);
  }

  let credentials;
  try {
    credentials = JSON.parse(keyJson);
  } catch {
    console.error('GDRIVE_SERVICE_ACCOUNT_JSON ist kein gültiges JSON - vermutlich beim Kopieren in das Secret verstümmelt.');
    process.exit(1);
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const driveClient = drive({ version: 'v3', auth });

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `zeiterfassung-backup-${today}.json`;

  const res = await driveClient.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: 'application/json', body: fs.createReadStream(backupPath) },
    fields: 'id, name, webViewLink',
  });

  console.log(`Hochgeladen: ${res.data.name} (ID ${res.data.id}) in Ordner ${folderId}.`);
}

main().catch((e) => {
  console.error('Upload fehlgeschlagen:', e?.response?.data || e.message || e);
  process.exit(1);
});
