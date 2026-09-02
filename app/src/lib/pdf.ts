import { rgbToGray } from '../core/formatters';

export function fileToDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Wandelt ein Foto in ein möglichst platzsparendes PDF um (nur so hochaufgelöst und farbig
 * wie für einen Zahlungsnachweis nötig): max. Breite 1100px, Schwarz-Weiß (Graustufen statt
 * Farbe - Zahlen/Text bleiben dadurch weiterhin gut lesbar, aber ohne die für die reine
 * Lesbarkeit unnötigen Farbinformationen), JPEG-Qualität 0.65.
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

  const maxW = 1100;
  const scale = Math.min(1, maxW / img.width);
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

  const jpeg = canvas.toDataURL('image/jpeg', 0.65);

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
