import { rgbToGray, estimateBase64Bytes } from '../core/formatters';

// Ziel: ~300dpi bei A4-Breite (8,27" × 300 ≈ 2481px) - der übliche Richtwert für gut lesbare
// Dokumenten-Scans. Echte DPI lassen sich aus einem Handyfoto nicht exakt bestimmen (wir
// kennen die tatsächliche physische Größe des fotografierten Belegs nicht), das ist die
// gängige Annäherung: den Beleg so behandeln, als würde er eine A4-Seite ausfüllen.
const ZIEL_BREITE_PX = 2480;
// Harte Obergrenze für die PDF-Zielgröße. Ein paar KB Puffer für den PDF-Container selbst
// (Struktur, keine große Datenmenge) - das eigentliche Foto muss etwas darunter bleiben.
const MAX_PDF_BYTES = 2 * 1024 * 1024;
const PDF_CONTAINER_OVERHEAD_BYTES = 20 * 1024;
// Von hoch nach niedrig absteigende Qualitätsstufen - die erste Stufe, die die Zielgröße
// einhält, wird verwendet. Reine Textbelege (viel weißer Hintergrund) komprimieren i.d.R.
// schon bei der ersten Stufe weit unter das Limit; nur sehr detailreiche/dunkle Fotos
// brauchen die niedrigeren Stufen.
const JPEG_QUALITAETSSTUFEN = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];

// Mindestanteil der Originalflaeche, den Scanics erkannte Kontur einnehmen muss, damit der
// Zuschnitt uebernommen wird. Am 02.09.2026 an allen 6 echten Beleg-Fotos eines Monats
// getestet: echte Treffer lagen bei 54-55% Flaechenanteil, Fehlerkennungen (z.B. ein
// zufaelliger Schattenwurf oder eine entartete/verzerrte Kontur) bei unter 19% - 40% liegt
// mit deutlichem Abstand dazwischen. Scanics eigener minDocumentCoverageRatio-Parameter
// griff im selben Test nicht zuverlaessig, daher diese zusaetzliche eigene Pruefung.
const SCANIC_MIN_FLAECHENANTEIL = 0.4;

interface Punkt { x: number; y: number; }
interface Eckpunkte { topLeft: Punkt; topRight: Punkt; bottomRight: Punkt; bottomLeft: Punkt; }

/** Reine, ohne Canvas-Abhaengigkeit testbare Funktion: Flaeche eines Vierecks aus seinen
 * Eckpunkten (Shoelace-Formel). WICHTIG: die Flaeche der von Scanic zurueckgegebenen
 * perspektivkorrigierten AUSGABE (output.width*height) kann bei einer entarteten/verzerrten
 * erkannten Kontur taeuschend gross wirken, obwohl die Eckpunkte im Originalbild eine
 * winzige, unplausible Flaeche einnehmen (real aufgetreten am 02.09.2026: eine fast
 * diagonale Linie im Foto wurde als Dokumentrand erkannt und auf 79.6% "aufgeblasen"
 * ausgegeben, obwohl die echte Flaeche der Eckpunkte nur 18.5% betrug). Deshalb IMMER diese
 * Funktion auf den rohen `corners` verwenden, nie `output.width*height`. */
export function shoelaceFlaeche(corners: Eckpunkte): number {
  const pts = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  let flaeche = 0;
  for (let i = 0; i < 4; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % 4];
    flaeche += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(flaeche) / 2;
}

/** Reine Entscheidungsfunktion (ohne Canvas-Abhaengigkeit, daher leicht testbar): ist die von
 * Scanic erkannte Flaeche plausibel genug, um den Zuschnitt zu uebernehmen? */
export function istZuschnittPlausibel(erkannteFlaeche: number, originalFlaeche: number): boolean {
  if (originalFlaeche <= 0) return false;
  return erkannteFlaeche / originalFlaeche >= SCANIC_MIN_FLAECHENANTEIL;
}
// Zielwert, auf den der geschaetzte Beleuchtungshintergrund normalisiert wird (nahe Weiss).
export function fileToDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Versucht, den Papierrand im Foto zu erkennen und perspektivkorrigiert zuzuschneiden
 * (Scanic, github.com/marquaye/scanic, MIT-Lizenz, ~100KB). Arbeitet bewusst auf dem
 * UNVERKLEINERTEN Originalfoto - Randerkennung ist auf voller Aufloesung zuverlaessiger.
 *
 * Gibt `null` zurueck (Aufrufer verwendet dann das Originalfoto unveraendert weiter), wenn:
 * - Scanic selbst keinen Kandidaten findet, ODER
 * - die erkannte Flaeche unplausibel klein ist (siehe SCANIC_MIN_FLAECHENANTEIL, berechnet
 *   aus den rohen Eckpunkten - NICHT aus der Ausgabegroesse, siehe shoelaceFlaeche) - das
 *   betraf real 4 von 6 getesteten Fotos sowie randlose, direkt hochgeladene Dokumente ohne
 *   sichtbaren Hintergrund, bei denen Scanic sonst faelschlich eine kleine interne
 *   Bildstruktur oder eine entartete Kontur als "das Dokument" erkennt.
 * - Scanic aus irgendeinem Grund nicht laedt (z.B. Netzwerkproblem beim erstmaligen Nachladen)
 *   - ein fehlschlagender Zuschnitt darf den Foto-Upload nie verhindern.
 */
async function versucheBelegZuschnitt(img: HTMLImageElement): Promise<HTMLCanvasElement | null> {
  try {
    const { scanDocument } = await import('scanic');
    const result = await scanDocument(img, { mode: 'extract', output: 'canvas' });
    if (!result.success) return null;
    const echteFlaeche = shoelaceFlaeche(result.corners as Eckpunkte);
    if (!istZuschnittPlausibel(echteFlaeche, img.width * img.height)) return null;
    const output = result.output as HTMLCanvasElement;
    return output;
  } catch {
    return null;
  }
}

function zuGraustufenCanvas(quelle: CanvasImageSource, breite: number, hoehe: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(breite));
  canvas.height = Math.max(1, Math.round(hoehe));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar');
  ctx.drawImage(quelle, 0, 0, canvas.width, canvas.height);

  // Manuelle Pixel-Umwandlung statt ctx.filter='grayscale(1)' - funktioniert zuverlässig auch
  // auf älteren mobilen Browsern ohne Canvas-Filter-Unterstützung.
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    const gray = rgbToGray(px[i], px[i + 1], px[i + 2]);
    px[i] = gray;
    px[i + 1] = gray;
    px[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Wandelt ein Foto in ein platzsparendes PDF um: Papierrand erkennen und zuschneiden
 * (Scanic), Graustufen statt Farbe (~300dpi bei A4-Breite). JPEG-Qualität wird automatisch
 * so weit abgesenkt, bis das PDF die 2-MB-Obergrenze einhält.
 *
 * WICHTIG (03.09.2026): Es gab hier zwischenzeitlich einen zusätzlichen Schritt, der auf
 * echtes, hartes Schwarz-Weiß (statt Graustufen) reduziert hat, um Speicher zu sparen. Das
 * wurde wieder entfernt: ein fester Schwellenwert verfälschte einzelne Ziffern dieser
 * Kassenbon-Schriftart (z.B. wurde "0" zu "3", reproduzierbar auch bei einem sauberen,
 * gut ausgeleuchteten Foto - lag NICHT an Scanic oder an schlechter Beleuchtung, sondern am
 * harten Schwellenwert selbst). Bei einem Finanzbeleg darf keine Ziffer optisch verfälscht
 * aussehen, auch nicht für zusätzliche Speicherersparnis - Verlässlichkeit geht vor.
 */
export async function photoToPdf(file: File): Promise<string> {
  // jsPDF erst hier bei tatsächlichem Bedarf nachladen (nicht im Hauptbundle) - spart auf
  // jedem Seitenaufruf ~350 KB (jsPDF zieht intern html2canvas + dompurify mit), obwohl
  // die allermeisten Aufrufe nie ein Foto hochladen. Scanic (~100KB) ebenso.
  const { jsPDF } = await import('jspdf');

  const dataUrl = await fileToDataURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = dataUrl;
  });

  const zugeschnitten = await versucheBelegZuschnitt(img);
  const quelle: CanvasImageSource = zugeschnitten ?? img;
  const quellBreite = zugeschnitten ? zugeschnitten.width : img.width;
  const quellHoehe = zugeschnitten ? zugeschnitten.height : img.height;

  const scale = Math.min(1, ZIEL_BREITE_PX / quellBreite);
  const canvas = zuGraustufenCanvas(quelle, quellBreite * scale, quellHoehe * scale);

  // Qualitätsstufe wählen: die höchste Stufe nehmen, deren JPEG-Größe die Zielgröße einhält.
  // Bleibt selbst die niedrigste Stufe darüber (sehr seltener Fall), wird trotzdem diese
  // niedrigste Stufe verwendet - besser ein etwas zu großes PDF als eines, das gar nicht
  // erst entsteht.
  const zielBytes = MAX_PDF_BYTES - PDF_CONTAINER_OVERHEAD_BYTES;
  let jpeg = canvas.toDataURL('image/jpeg', JPEG_QUALITAETSSTUFEN[0]);
  for (const q of JPEG_QUALITAETSSTUFEN) {
    jpeg = canvas.toDataURL('image/jpeg', q);
    if (estimateBase64Bytes(jpeg) <= zielBytes) break;
  }

  const isLandscape = canvas.width > canvas.height;
  const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  pdf.addImage(jpeg, 'JPEG', x, y, w, h);
  return pdf.output('datauristring');
}
