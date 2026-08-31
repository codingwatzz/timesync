// Kleine, wiederverwendbare Hilfsfunktionen ohne Testlogik - analog zu core/formatters.ts
// (reine Helfer, keine Testschritte).

function log(msg) {
  console.log(`[e2e] ${msg}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Minimale, valide Ein-Seiten-PDF für Beleg-Upload-Tests - kein externes Tool nötig.
const MINIMAL_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
xref
0 4
0000000000 65535 f 
trailer<</Size 4/Root 1 0 R>>
startxref
0
%%EOF`;

module.exports = { log, sleep, MINIMAL_PDF };
