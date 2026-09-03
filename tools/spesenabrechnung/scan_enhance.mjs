#!/usr/bin/env node
/**
 * Verarbeitet EIN Beleg-Bild: erkennt Papierränder und schneidet zu (Scanic), wandelt in
 * Graustufen um.
 *
 * Nutzung: node scan_enhance.js <input.png> <output.png>
 *
 * WICHTIG (03.09.2026): Es gab hier zwischenzeitlich einen zusätzlichen Schritt
 * (Beleuchtungsausgleich + harter Schwellenwert auf echtes Schwarz-Weiß, um Speicher zu
 * sparen). Das wurde wieder entfernt: ein fester Schwellenwert verfälschte einzelne Ziffern
 * dieser Kassenbon-Schriftart (z.B. wurde "0" zu "3", reproduzierbar auch bei einem
 * sauberen, gut ausgeleuchteten Foto - lag NICHT an Scanic oder an schlechter Beleuchtung,
 * sondern am harten Schwellenwert selbst, siehe Vergleichsbilder in der Diskussion). Bei
 * einem Finanzbeleg darf keine Ziffer optisch verfälscht aussehen, auch nicht für
 * zusätzliche Speicherersparnis - Verlässlichkeit geht vor. Reine Graustufen (ohne
 * Schwellenwert) zeigten im selben Test alle Ziffern korrekt.
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

// Mindestanteil der Originalflaeche, den die erkannte Kontur einnehmen muss, damit sie als
// echter Zuschnitt akzeptiert wird. Getestet an allen 6 echten August-Belegen (02.09.2026):
// echte Treffer lagen bei 54-55% Flaechenanteil, Fehlerkennungen (z.B. ein zufaelliger
// Schattenwurf, eine kleine interne Box in einer randlosen Rechnung, oder eine entartete
// Kontur) bei unter 19% - 40% liegt mit deutlichem Abstand dazwischen.
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

async function toGrayscale(imageBufferOrPath) {
  return sharp(imageBufferOrPath).grayscale().png().toBuffer();
}

async function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error('Nutzung: node scan_enhance.js <input.png> <output.png>');
    process.exit(1);
  }

  const cropped = await scanicCrop(inputPath);
  const source = cropped ?? fs.readFileSync(inputPath);
  const final = await toGrayscale(source);
  fs.writeFileSync(outputPath, final);
  console.log(JSON.stringify({ cropped: cropped !== null, output: outputPath }));
}

main().catch((e) => { console.error(e); process.exit(1); });
