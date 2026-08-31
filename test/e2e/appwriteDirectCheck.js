// Direkter Appwrite-Read über einen ZWEITEN, unabhängigen SDK-Client im Browser - komplett an
// App-State und Test-eigenem Zustand vorbei. War am 31.08.2026 der Schlüssel, um "Eventual
// Consistency" (Appwrite braucht nach dem Schreiben manchmal Sekunden, bis Lesezugriffe den
// neuen Stand zeigen) zweifelsfrei nachzuweisen. Als eigenes Modul, damit dieser Kniff bei
// künftigen Debugging-Sitzungen sofort verfügbar ist, statt neu erfunden werden zu müssen.

const { APPWRITE_CONFIG } = require('./config');
const { log } = require('./utils');

/**
 * Liest eine Zeile direkt aus Appwrite, unabhängig von der App im Browser-Tab.
 * @param {import('playwright').Page} page - eine bereits geöffnete Playwright-Seite (wird nur
 *   als JS-Ausführungsumgebung mit Internetzugriff genutzt, nicht die App selbst).
 * @param {string} rowId - bereits Appwrite-konforme Zeilen-ID (siehe appwriteId-Sanitisierung).
 * @param {string} label - nur für die Log-Ausgabe.
 */
async function directAppwriteRead(page, rowId, label) {
  try {
    const result = await page.evaluate(async ({ endpoint, project, db, table, rowId }) => {
      const { Client, TablesDB } = await import('https://cdn.jsdelivr.net/npm/appwrite@latest/+esm');
      const client = new Client().setEndpoint(endpoint).setProject(project);
      const tablesDB = new TablesDB(client);
      try {
        const row = await tablesDB.getRow({ databaseId: db, tableId: table, rowId });
        return { found: true, rawValue: row.value };
      } catch (e) {
        return { found: false, message: e?.message, code: e?.code };
      }
    }, {
      endpoint: APPWRITE_CONFIG.endpoint,
      project: APPWRITE_CONFIG.projectId,
      db: APPWRITE_CONFIG.databaseId,
      table: APPWRITE_CONFIG.tableId,
      rowId,
    });

    if (result.found) {
      const parsed = JSON.parse(result.rawValue);
      log(`Direkter Appwrite-Read (${label}): gefunden, beschreibung="${parsed.beschreibung}", km="${parsed.km}"`);
      return { found: true, beschreibung: parsed.beschreibung, km: parsed.km };
    }
    log(`Direkter Appwrite-Read (${label}): NICHT gefunden (${result.message}, Code ${result.code})`);
    return { found: false, message: result.message, code: result.code };
  } catch (e) {
    log(`Direkter Appwrite-Read (${label}) fehlgeschlagen: ${e.message}`);
    return { error: String(e) };
  }
}

/** Appwrite-ID-Sanitisierung, identisch zu app/src/store/appwriteId.ts. */
function toAppwriteRowId(key) {
  let id = key.replace(/[^a-zA-Z0-9_]/g, '_');
  id = id.replace(/^_+/, '');
  if (!id) id = 'id' + Date.now();
  if (id.length > 36) id = id.slice(0, 36);
  return id;
}

module.exports = { directAppwriteRead, toAppwriteRowId };
