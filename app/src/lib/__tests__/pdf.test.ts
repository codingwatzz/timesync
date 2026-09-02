import { describe, it, expect } from 'vitest';
import { istZuschnittPlausibel, shoelaceFlaeche } from '../pdf';

describe('shoelaceFlaeche', () => {
  it('berechnet die Fläche eines einfachen Rechtecks korrekt', () => {
    const flaeche = shoelaceFlaeche({
      topLeft: { x: 0, y: 0 },
      topRight: { x: 10, y: 0 },
      bottomRight: { x: 10, y: 20 },
      bottomLeft: { x: 0, y: 20 },
    });
    expect(flaeche).toBe(200);
  });

  it('erkennt die winzige echte Fläche einer entarteten/verzerrten Kontur (realer Fall 20.08.2026)', () => {
    // Reale Eckpunkte, bei denen Scanics Ausgabegröße täuschend 79.6% zeigte, obwohl die
    // echte Fläche der Eckpunkte nur 18.5% betrug (eine fast diagonale Linie im Foto wurde
    // faelschlich als Dokumentrand erkannt).
    const flaeche = shoelaceFlaeche({
      topLeft: { x: 526.275, y: 418.09625 },
      topRight: { x: 678.31, y: 415.1725 },
      bottomRight: { x: 1391.705, y: 444.41 },
      bottomLeft: { x: 1380.01, y: 2087.5575 },
    });
    const originalFlaeche = 1654 * 2339;
    expect(flaeche / originalFlaeche).toBeCloseTo(0.185, 2);
  });
});

describe('istZuschnittPlausibel', () => {
  // Reale Messwerte vom 02.09.2026 (Shoelace-Flaeche der Eckpunkte, NICHT die
  // Ausgabegroesse - siehe Kommentar in pdf.ts): echte Treffer 54-55%, Fehlerkennungen
  // (inkl. entarteter Konturen) unter 19%.
  it('akzeptiert echte Treffer (54-55% Flaechenanteil)', () => {
    expect(istZuschnittPlausibel(0.554 * 1000, 1000)).toBe(true);
    expect(istZuschnittPlausibel(0.544 * 1000, 1000)).toBe(true);
  });

  it('lehnt Fehlerkennungen ab (unter 19% Flaechenanteil, inkl. entarteter Konturen)', () => {
    expect(istZuschnittPlausibel(0.008 * 1000, 1000)).toBe(false);
    expect(istZuschnittPlausibel(0.014 * 1000, 1000)).toBe(false);
    expect(istZuschnittPlausibel(0.185 * 1000, 1000)).toBe(false); // entartete Kontur, 20.08.
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
