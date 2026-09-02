import { describe, it, expect } from 'vitest';
import { istZuschnittPlausibel } from '../pdf';

describe('istZuschnittPlausibel', () => {
  // Reale Messwerte vom 02.09.2026 (siehe Kommentar in pdf.ts): echte Treffer 55-80%,
  // Fehlerkennungen unter 8%.
  it('akzeptiert echte Treffer (55-80% Flaechenanteil)', () => {
    expect(istZuschnittPlausibel(0.582 * 1000, 1000)).toBe(true);
    expect(istZuschnittPlausibel(0.565 * 1000, 1000)).toBe(true);
    expect(istZuschnittPlausibel(0.796 * 1000, 1000)).toBe(true);
  });

  it('lehnt Fehlerkennungen ab (unter 8% Flaechenanteil)', () => {
    expect(istZuschnittPlausibel(0.076 * 1000, 1000)).toBe(false);
    expect(istZuschnittPlausibel(0.016 * 1000, 1000)).toBe(false);
    expect(istZuschnittPlausibel(0.005 * 1000, 1000)).toBe(false);
    expect(istZuschnittPlausibel(0.052 * 1000, 1000)).toBe(false); // randlose Rechnung, kleine interne Box erkannt
  });

  it('liegt die Grenze bei 40%', () => {
    expect(istZuschnittPlausibel(399, 1000)).toBe(false);
    expect(istZuschnittPlausibel(400, 1000)).toBe(true);
  });

  it('lehnt ab, wenn die Originalflaeche 0 oder negativ ist (Division durch 0 vermeiden)', () => {
    expect(istZuschnittPlausibel(100, 0)).toBe(false);
    expect(istZuschnittPlausibel(100, -1)).toBe(false);
  });
});
