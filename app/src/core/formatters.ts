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
