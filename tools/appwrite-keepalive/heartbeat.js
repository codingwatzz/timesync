// Schreibt per Appwrite-API-Key eine einzelne, unauffällige Zeile (rowId "heartbeat") in die
// bestehende key-value-Tabelle der App - in der Hoffnung, dass das als "Entwicklungsaktivität"
// zählt und die Free-Tier-Inaktivitäts-Pause verhindert (siehe PROJEKT_UEBERSICHT.md, Abschnitt
// "Backend", und CLAUDE_CHECKLIST.md Abschnitt 3 für den Hintergrund).
//
// WICHTIG - ehrliche Einordnung, nicht als sichere Lösung verkaufen: Appwrite sagt offiziell,
// dass normale API-/SDK-Nutzung NICHT als Aktivität zählt, nur Aktivität in der Console. Ein
// API-KEY-basierter Schreibvorgang (wie hier) ist etwas anderes als der session-basierte
// Zugriff, den die App selbst nutzt - ob das wirklich zählt, ist NICHT offiziell bestätigt,
// nur von einem Community-Tool behauptet. Falls das Projekt trotzdem wieder pausiert wird,
// ist das kein Bug in diesem Skript, sondern schlicht: hat nicht funktioniert. Dann bleibt nur
// der übliche Weg (in der Console manuell "Restore project" klicken).
//
// Bewusst OHNE node-appwrite-Abhängigkeit - reines fetch() (Node 22 hat das eingebaut), damit
// hier nichts zu installieren/zu pflegen ist und die Anfrage für jeden direkt nachvollziehbar
// im Klartext dasteht (kein SDK-Vertrauen nötig für etwas, das einen API-Key handhabt).

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const TABLE_ID = process.env.APPWRITE_TABLE_ID;
const API_KEY = process.env.APPWRITE_KEEPALIVE_KEY;

const ROW_ID = 'heartbeat'; // bewusst OHNE "entry:"/"receipt:"-Präfix - kollidiert nicht mit
                            // echten App-Daten und wird von der App nie gelesen (sie fragt
                            // immer gezielt nach entry:<datum>/receipt:<id>, nie die ganze
                            // Tabelle ab).

async function main() {
  for (const [name, val] of Object.entries({ ENDPOINT, PROJECT_ID, DATABASE_ID, TABLE_ID, API_KEY })) {
    if (!val) throw new Error(`Umgebungsvariable fehlt: ${name}`);
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': PROJECT_ID,
    'X-Appwrite-Key': API_KEY,
  };
  const body = JSON.stringify({
    data: { value: JSON.stringify({ ts: new Date().toISOString(), source: 'github-actions-keepalive' }) },
  });

  const baseUrl = `${ENDPOINT}/tablesdb/${DATABASE_ID}/tables/${TABLE_ID}/rows`;

  // Erst Update versuchen (Zeile existiert normalerweise schon ab dem zweiten Lauf) - analog
  // zum try-update-dann-create-Muster, das appwriteStore.ts für alle anderen Schreibvorgänge
  // ebenfalls nutzt.
  let res = await fetch(`${baseUrl}/${ROW_ID}`, { method: 'PATCH', headers, body });
  if (res.status === 404) {
    res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rowId: ROW_ID, ...JSON.parse(body) }),
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Appwrite antwortete mit ${res.status}: ${text.slice(0, 500)}`);
  }

  console.log(`Heartbeat geschrieben: ${new Date().toISOString()}`);
}

main().catch((e) => {
  console.error('Heartbeat fehlgeschlagen:', e.message);
  process.exit(1);
});
