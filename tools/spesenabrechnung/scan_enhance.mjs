#!/usr/bin/env node
/**
 * Verarbeitet EIN Beleg-Bild: erkennt Papierränder und schneidet zu (Scanic), gleicht dann
 * ungleichmäßige Beleuchtung/Schatten aus und wandelt in echtes, hochkontrastiges
 * Schwarz-Weiß um ("Adobe Scan"-Optik, siehe Anfrage vom 02.09.2026).
 *
 * Nutzung: node scan_enhance.js <input.png> <output.png>
 *
 * Ablauf:
 * 1) Scanic erkennt das Papier im Foto und schneidet es perspektivkorrigiert zu. Schlägt die
 *    Erkennung fehl (z.B. bei einem bereits randlosen, direkt hochgeladenen PDF wie einer
 *    Rechnung ohne sichtbaren Hintergrund), wird einfach das Originalbild unveraendert
 *    weiterverwendet - kein Abbruch.
 * 2) Ausgleich ungleichmäßiger Beleuchtung ("Flat-Field-Korrektur"): eine stark
 *    weichgezeichnete Kopie dient als Schätzung des Beleuchtungsverlaufs; das Originalbild
 *    wird durch diese Schätzung geteilt. Das behebt genau den Fehler vom 02.09.2026, bei dem
 *    ein einzelner fester Schwellenwert den Schattenwurf eines Handyfotos zu einer
 *    schwarzen Flaeche zusammenfrass und die Betrags-Zahlen unlesbar machte.
 * 3) Fester Schwellenwert auf dem beleuchtungskorrigierten Bild ergibt sauberes,
 *    gleichmaessiges Schwarz-Weiss.
 */
import { scanDocument } from 'scanic';
import { loadImage, createCanvas, ImageData as NodeImageData } from 'canvas';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import fs from 'fs';

// Nur einmal pro Prozess einrichten - Scanic braucht eine minimale DOM-Umgebung.
const dom = new JSDOM();
global.document = dom.window.document;
global.ImageData = dom.window.ImageData;
global.window = dom.window;

const BLUR_SIGMA = 41; // grobe Beleuchtungsschätzung - deutlich groesser als einzelne Buchstaben
const ZIEL_HINTERGRUND = 205; // Hintergrund wird auf diesen Grauwert normalisiert (nahe Weiss)
const SCHWELLENWERT = 150;
// Mindestanteil der Originalflaeche, den die erkannte Kontur einnehmen muss, damit sie als
// echter Zuschnitt akzeptiert wird. Getestet an allen 6 echten August-Belegen (02.09.2026):
// echte Treffer lagen bei 55-80% Flaechenanteil, Fehlerkennungen (z.B. ein zufaelliger
// Schattenwurf oder eine kleine interne Box in einer randlosen Rechnung) bei unter 8% -
// 40% liegt mit deutlichem Abstand dazwischen.
const MIN_FLAECHENANTEIL = 0.4;

function shoelaceFlaeche(corners) {
  const pts = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % 4];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area) / 2;
}

async function scanicCrop(inputPath) {
  const img = await loadImage(inputPath);
  const result = await scanDocument(img, { mode: 'extract', output: 'canvas' });
  if (!result.success) return null;

  // WICHTIG: die Flaeche der WARPED-AUSGABE (result.output.width*height) kann bei einer
  // entarteten/verzerrten Kontur taeuschend gross wirken, obwohl die tatsaechlich erkannten
  // Eckpunkte im Originalbild eine winzige, unplausible Flaeche einnehmen (real aufgetreten
  // am 02.09.2026 beim 20.08.-Beleg: Ausgabegroesse zeigte 79.6%, die echte Flaeche der
  // Eckpunkte per Shoelace-Formel aber nur 18.5% - eine fast diagonale Linie wurde als
  // Dokumentrand erkannt und stark verzerrt "aufgeblasen"). Deshalb die Flaeche IMMER direkt
  // aus den erkannten Eckpunkten berechnen, nie aus der Ausgabegroesse.
  const echteFlaeche = shoelaceFlaeche(result.corners);
  const flaechenanteil = echteFlaeche / (img.width * img.height);
  if (flaechenanteil < MIN_FLAECHENANTEIL) {
    // Erkennung mit unplausibel kleiner Flaeche - vermutlich eine Fehlerkennung (z.B.
    // Schattenwurf, eine kleine interne Box statt des echten Blattrands, oder eine entartete
    // Kontur wie oben). Lieber das Originalbild unveraendert weiterverwenden als einen
    // falschen Zuschnitt riskieren.
    return null;
  }

  const w = result.output.width, h = result.output.height;
  // Scanic liefert unter Node ein jsdom-HTMLCanvasElement, dessen Pixel per getImageData
  // ausgelesen und auf ein echtes node-canvas-Canvas uebertragen werden muessen (jsdoms
  // eigenes Canvas-Objekt ist nicht direkt mit node-canvas' drawImage/toBuffer kompatibel).
  const srcCtx = result.output.getContext('2d');
  const imgData = srcCtx.getImageData(0, 0, w, h);
  const nodeCanvas = createCanvas(w, h);
  const nodeCtx = nodeCanvas.getContext('2d');
  nodeCtx.putImageData(new NodeImageData(new Uint8ClampedArray(imgData.data), w, h), 0, 0);
  return nodeCanvas.toBuffer('image/png');
}

async function illuminationCorrectAndThreshold(imageBufferOrPath) {
  const gray = sharp(imageBufferOrPath).grayscale();
  const { data, info } = await gray.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const blurred = await sharp(data, { raw: { width, height, channels: 1 } })
    .blur(BLUR_SIGMA)
    .raw()
    .toBuffer();

  const corrected = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    const bg = blurred[i] || 1;
    corrected[i] = Math.max(0, Math.min(255, Math.round((data[i] / bg) * ZIEL_HINTERGRUND)));
  }

  return sharp(corrected, { raw: { width, height, channels: 1 } })
    .threshold(SCHWELLENWERT)
    .png()
    .toBuffer();
}

async function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error('Nutzung: node scan_enhance.js <input.png> <output.png>');
    process.exit(1);
  }

  const cropped = await scanicCrop(inputPath);
  const source = cropped ?? fs.readFileSync(inputPath);
  const final = await illuminationCorrectAndThreshold(source);
  fs.writeFileSync(outputPath, final);
  console.log(JSON.stringify({ cropped: cropped !== null, output: outputPath }));
}

main().catch((e) => { console.error(e); process.exit(1); });
