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
// getestet: echte Treffer lagen bei 55-80% Flaechenanteil, Fehlerkennungen (z.B. ein
// zufaelliger Schattenwurf) bei unter 8% - 40% liegt mit deutlichem Abstand dazwischen.
// Scanics eigener minDocumentCoverageRatio-Parameter griff im selben Test nicht zuverlaessig,
// daher diese zusaetzliche eigene Pruefung.
const SCANIC_MIN_FLAECHENANTEIL = 0.4;

/** Reine Entscheidungsfunktion (ohne Canvas-Abhaengigkeit, daher leicht testbar): ist die von
 * Scanic erkannte Flaeche plausibel genug, um den Zuschnitt zu uebernehmen? */
export function istZuschnittPlausibel(erkannteFlaeche: number, originalFlaeche: number): boolean {
  if (originalFlaeche <= 0) return false;
  return erkannteFlaeche / originalFlaeche >= SCANIC_MIN_FLAECHENANTEIL;
}
// Zielwert, auf den der geschaetzte Beleuchtungshintergrund normalisiert wird (nahe Weiss).
const BELEUCHTUNG_ZIEL = 205;
const SCHWARZWEISS_SCHWELLENWERT = 150;

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
 * - die erkannte Flaeche unplausibel klein ist (siehe SCANIC_MIN_FLAECHENANTEIL) - das betraf
 *   real 3 von 6 getesteten Fotos sowie randlose, direkt hochgeladene Dokumente ohne
 *   sichtbaren Hintergrund, bei denen Scanic sonst faelschlich eine kleine interne
 *   Bildstruktur (z.B. eine umrandete Box) als "das Dokument" erkennt.
 * - Scanic aus irgendeinem Grund nicht laedt (z.B. Netzwerkproblem beim erstmaligen Nachladen)
 *   - ein fehlschlagender Zuschnitt darf den Foto-Upload nie verhindern.
 */
async function versucheBelegZuschnitt(img: HTMLImageElement): Promise<HTMLCanvasElement | null> {
  try {
    const { scanDocument } = await import('scanic');
    const result = await scanDocument(img, { mode: 'extract', output: 'canvas' });
    if (!result.success) return null;
    const output = result.output as HTMLCanvasElement;
    if (!istZuschnittPlausibel(output.width * output.height, img.width * img.height)) return null;
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
 * Gleicht ungleichmäßige Beleuchtung/Schatten aus ("Flat-Field-Korrektur") und wandelt
 * anschließend in echtes, hochkontrastiges Schwarz-Weiß um (kein Graustufen-Zwischending -
 * spart deutlich mehr Speicher). Verändert `grauCanvas` direkt (in-place).
 *
 * Ohne diesen Ausgleich frisst ein einzelner fester Schwellenwert den Schattenwurf eines
 * Handyfotos zu einer schwarzen Fläche zusammen und macht Zahlen/Text darin unlesbar (real
 * aufgetreten am 02.09.2026 beim serverseitigen Pendant dieser Funktion). Die Technik: eine
 * stark verkleinerte und wieder hochskalierte Kopie dient als günstige Näherung einer starken
 * Weichzeichnung (Skalieren glättet automatisch, keine eigene Faltungs-Implementierung
 * nötig) und damit als Schätzung des Beleuchtungsverlaufs; das Originalbild wird durch diese
 * Schätzung geteilt, bevor der Schwellenwert angewendet wird.
 */
function beleuchtungAusgleichenUndSchwarzWeiss(grauCanvas: HTMLCanvasElement): void {
  const { width: w, height: h } = grauCanvas;
  const ctx = grauCanvas.getContext('2d');
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar');

  const kleinBreite = 50;
  const kleinHoehe = Math.max(1, Math.round(h * (kleinBreite / w)));
  const kleinCanvas = document.createElement('canvas');
  kleinCanvas.width = kleinBreite;
  kleinCanvas.height = kleinHoehe;
  const kleinCtx = kleinCanvas.getContext('2d');
  if (!kleinCtx) throw new Error('Canvas-Kontext nicht verfügbar');
  kleinCtx.drawImage(grauCanvas, 0, 0, kleinBreite, kleinHoehe);

  const hintergrundCanvas = document.createElement('canvas');
  hintergrundCanvas.width = w;
  hintergrundCanvas.height = h;
  const hintergrundCtx = hintergrundCanvas.getContext('2d');
  if (!hintergrundCtx) throw new Error('Canvas-Kontext nicht verfügbar');
  hintergrundCtx.imageSmoothingEnabled = true;
  hintergrundCtx.drawImage(kleinCanvas, 0, 0, w, h);

  const original = ctx.getImageData(0, 0, w, h);
  const hintergrund = hintergrundCtx.getImageData(0, 0, w, h);
  const px = original.data;
  const bg = hintergrund.data;
  for (let i = 0; i < px.length; i += 4) {
    const bgWert = bg[i] || 1;
    const normalisiert = (px[i] / bgWert) * BELEUCHTUNG_ZIEL;
    const wert = normalisiert > SCHWARZWEISS_SCHWELLENWERT ? 255 : 0;
    px[i] = wert;
    px[i + 1] = wert;
    px[i + 2] = wert;
  }
  ctx.putImageData(original, 0, 0);
}

/**
 * Wandelt ein Foto in ein möglichst platzsparendes PDF um: Papierrand erkennen und
 * zuschneiden (Scanic), Beleuchtung ausgleichen, in echtes Schwarz-Weiß wandeln (~300dpi bei
 * A4-Breite). JPEG-Qualität wird automatisch so weit abgesenkt, bis das PDF die 2-MB-
 * Obergrenze einhält (ein schwarz-weißer Beleg bleibt i.d.R. weit darunter).
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
  beleuchtungAusgleichenUndSchwarzWeiss(canvas);

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
