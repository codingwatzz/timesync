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

/**
 * Erzeugt ein minimales, gültiges PNG (unkomprimiertes RGB) für Foto-Upload-/Zuschnitt-Tests -
 * analog zu MINIMAL_PDF oben, kein externes Bild-Tool/keine Test-Fixture-Datei im Repo nötig.
 * Nutzt zlib.crc32 (erst ab Node 22 vorhanden - passt zur ohnehin für die Workflows
 * vorausgesetzten Node-Version, siehe CLAUDE_CHECKLIST.md).
 */
function createMinimalPng(width = 60, height = 40) {
  const zlib = require('zlib');
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(typeData) >>> 0, 0);
    return Buffer.concat([len, typeData, crc]);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit-Tiefe
  ihdrData[9] = 2; // Farbtyp: RGB (kein Alpha, kein Indexed - hält es einfach)
  ihdrData[10] = 0; // Kompressionsmethode
  ihdrData[11] = 0; // Filtermethode
  ihdrData[12] = 0; // Interlace: aus

  // Rohdaten: pro Zeile 1 Filter-Byte (0 = "keiner") + width*3 Byte RGB - hellgrauer, mit einem
  // dunkleren Rand versehener "Beleg"-Platzhalter, damit im Zuschnitt-Dialog optisch überhaupt
  // etwas vom bloßen Hintergrund zu unterscheiden ist.
  const rowBytes = 1 + width * 3;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0;
    const amRand = y < 3 || y >= height - 3;
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      const randSpalte = x < 3 || x >= width - 3;
      const grau = (amRand || randSpalte) ? 90 : 235;
      raw[px] = grau; raw[px + 1] = grau; raw[px + 2] = grau;
    }
  }
  const idatData = zlib.deflateSync(raw);

  return Buffer.concat([sig, chunk('IHDR', ihdrData), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { log, sleep, MINIMAL_PDF, createMinimalPng };
