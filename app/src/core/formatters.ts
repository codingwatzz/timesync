// Reine Formatierungs- und Datumshilfsfunktionen. Keine DOM-Abhängigkeit.

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Formatiert einen Betrag als deutsche Euro-Schreibweise, z.B. 15.5 -> "15,50". */
export function fmtEUR(n: number | string | undefined | null): string {
  const num = Number(n) || 0;
  // Winziger Epsilon-Ausgleich gegen Floating-Point-Artefakte (z.B. 1.005*100 wird intern
  // zu 100.49999... statt 100.5). 1e-9 ist groß genug, um das zu korrigieren, aber viel
  // kleiner als jeder real unterscheidbare Cent-Betrag.
  const cents = Math.round(num * 100 + (num >= 0 ? 1e-9 : -1e-9));
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Wandelt einen beliebigen numerischen String/Wert sicher in eine Zahl, Fallback 0. */
export function toNumber(v: string | number | undefined | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Graustufen-Helligkeit nach ITU-R BT.601 (gängige Gewichtung fürs menschliche Auge) - wird
 * beim Foto-Beleg-Upload verwendet, um Farbfotos platzsparend in Schwarz-Weiß umzuwandeln
 * (siehe lib/pdf.ts::photoToPdf).
 */
export function rgbToGray(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

/** Feste Auswahl für die Pausenzeit-Eingabemaske: 0-180 Minuten in 15er-Schritten. */
export const PAUSE_MINUTEN_SCHRITTE: string[] = Array.from({ length: 13 }, (_, i) => String(i * 15));

/**
 * Baut die Options-Liste für die Pausenzeit-Auswahl: die festen 15er-Schritte, plus - falls
 * der aktuell gespeicherte Wert (z.B. aus einem älteren, per Texteingabe erfassten Eintrag)
 * kein Vielfaches von 15 ist - diesen Wert zusätzlich an der richtigen Stelle einsortiert,
 * damit er nicht stillschweigend falsch/verschwunden dargestellt wird.
 */
export function pauseOptionsFor(current: string): string[] {
  const normalized = current || '0';
  if (PAUSE_MINUTEN_SCHRITTE.includes(normalized)) return PAUSE_MINUTEN_SCHRITTE;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return PAUSE_MINUTEN_SCHRITTE;
  return [...PAUSE_MINUTEN_SCHRITTE, normalized].sort((a, b) => Number(a) - Number(b));
}
