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

export function fileToDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Wandelt ein Foto in ein platzsparendes PDF um: Graustufen statt Farbe (~300dpi bei
 * A4-Breite). JPEG-Qualität wird automatisch so weit abgesenkt, bis das PDF die 2-MB-
 * Obergrenze einhält.
 *
 * WICHTIG (03.09.2026): Es gab hier zwischenzeitlich automatische Rand-Erkennung/Zuschnitt
 * (Scanic) und danach einen harten Schwarz-Weiß-Schwellenwert. Beides wurde wieder entfernt:
 * der Schwellenwert verfälschte einzelne Ziffern (z.B. wurde "0" zu "3"), und der
 * Scanic-Zuschnitt lieferte in der echten Nutzung (eigener Test durch den Nutzer, mehrere
 * Fotos unter guten Lichtverhältnissen) keine ausreichend zuverlässigen Ergebnisse - zu
 * fehleranfällig und zu komplex für den Nutzen. Zurück zum einfachen, seit Monaten
 * bewährten Stand: nur Graustufen, kein Zuschnitt, kein Schwellenwert.
 */
export async function photoToPdf(file: File): Promise<string> {
  // jsPDF erst hier bei tatsächlichem Bedarf nachladen (nicht im Hauptbundle) - spart auf
  // jedem Seitenaufruf ~350 KB (jsPDF zieht intern html2canvas + dompurify mit), obwohl
  // die allermeisten Aufrufe nie ein Foto hochladen.
  const { jsPDF } = await import('jspdf');

  const dataUrl = await fileToDataURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = dataUrl;
  });

  const scale = Math.min(1, ZIEL_BREITE_PX / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

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
