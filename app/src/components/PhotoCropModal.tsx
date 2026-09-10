import { useEffect, useRef, useState } from 'react';
import ReactCrop, { centerCrop, cropToCanvas, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Check, X as XIcon } from 'lucide-react';
import { fileToDataURL } from '../lib/pdf';

interface PhotoCropModalProps {
  /** Rohe, gerade aufgenommene/ausgewählte Foto-Datei. `null` = Modal geschlossen. */
  file: File | null;
  /** Liefert die zugeschnittene Datei zurück - der Aufrufer erzeugt daraus wie bisher die PDF
   * (siehe DetailSheet.tsx::handlePhotoUpload). Zuschnitt passiert also VOR der PDF-Erzeugung,
   * nicht nachträglich an bereits hochgeladenen Belegen (Nutzer-Entscheidung 09.09.2026). */
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
}

/**
 * Manueller Zuschnitt per Zieh-Rahmen (react-image-crop, PointerEvents - Maus UND Touch).
 * Bewusst KEINE automatische Rand-Erkennung - genau das ("Scanic") wurde am 03.09.2026 wieder
 * entfernt, weil in echten Tests zu unzuverlässig. Hier zieht der Nutzer den Rahmen selbst,
 * kein Erkennungsrisiko.
 * Bewusst KEIN festes Seitenverhältnis (`aspect` nicht gesetzt) - Belege reichen von schmalen
 * Kassenbons bis zu A4-Rechnungen, ein erzwungenes Seitenverhältnis wäre hier unpassend.
 */
export function PhotoCropModal({ file, onConfirm, onCancel }: PhotoCropModalProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    fileToDataURL(file).then((url) => { if (!cancelled) setImgSrc(url); });
    return () => { cancelled = true; };
  }, [file]);

  if (!file || !imgSrc) return null;

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    // Start-Auswahl: 90% der Fläche, mittig - der Nutzer zieht bei Bedarf selbst nach.
    setCrop(centerCrop({ unit: '%', width: 90, height: 90 }, width, height));
  }

  async function handleConfirm() {
    if (!imgRef.current || !completedCrop || !file || completedCrop.width < 1 || completedCrop.height < 1) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      await cropToCanvas(imgRef.current, canvas, completedCrop);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('leer');
      onConfirm(new File([blob], file.name, { type: 'image/png' }));
    } catch {
      // Zuschnitt ist eine Komfort-Funktion, kein Muss - bei einem Fehlschlag lieber mit dem
      // ungeschnittenen Original weitermachen als den ganzen Beleg-Upload zu blockieren.
      onConfirm(file);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[62] flex flex-col bg-black/90 p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[15px] font-bold text-text">Beleg zuschneiden</span>
        <span className="text-xs text-text-muted">Rahmen ziehen, dann übernehmen</span>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <ReactCrop
          crop={crop}
          onChange={(_pixelCrop, percentCrop) => setCrop(percentCrop)}
          onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
          className="max-h-full"
        >
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Beleg-Vorschau, kein informativer Alt-Text nötig */}
          <img ref={imgRef} src={imgSrc} onLoad={onImageLoad} style={{ maxHeight: '70vh', maxWidth: '100%' }} />
        </ReactCrop>
      </div>
      <div className="mt-3 flex gap-2.5">
        <button
          id="cropCancelBtn"
          disabled={busy}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-bold text-text transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50"
          onClick={onCancel}
        >
          <XIcon size={16} strokeWidth={2.25} /> Abbrechen
        </button>
        <button
          id="cropConfirmBtn"
          disabled={busy || !completedCrop}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-text-on-accent transition-colors hover:bg-primary-strong focus-visible:ring-2 focus-visible:ring-text focus-visible:outline-none disabled:opacity-50"
          onClick={handleConfirm}
        >
          <Check size={16} strokeWidth={2.25} /> {busy ? 'Wird zugeschnitten…' : 'Übernehmen'}
        </button>
      </div>
    </div>
  );
}
