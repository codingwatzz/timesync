import { describe, it, expect } from 'vitest';
import { pad, daysInMonth, fmtEUR, toNumber, pauseOptionsFor, PAUSE_MINUTEN_SCHRITTE, rgbToGray, estimateBase64Bytes } from '../formatters';

describe('pad', () => {
  it('füllt einstellige Zahlen mit führender Null', () => {
    expect(pad(5)).toBe('05');
  });
  it('lässt zweistellige Zahlen unverändert', () => {
    expect(pad(12)).toBe('12');
  });
});

describe('daysInMonth', () => {
  it('kennt Schaltjahre', () => {
    expect(daysInMonth(2028, 2)).toBe(29); // 2028 ist ein Schaltjahr
    expect(daysInMonth(2026, 2)).toBe(28);
  });
  it('kennt Monate mit 31 Tagen', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
  });
});

describe('fmtEUR', () => {
  // Genau der Fall, der im E2E-Test am 30.08. für Verwirrung sorgte:
  // '15.50' als Eingabe sollte als "15,50" erscheinen, nicht "15,5".
  it('formatiert mit exakt 2 Nachkommastellen (deutsches Komma)', () => {
    expect(fmtEUR(15.5)).toBe('15,50');
    expect(fmtEUR('15.50')).toBe('15,50');
    expect(fmtEUR(7)).toBe('7,00');
  });
  it('behandelt leere/undefinierte Werte als 0', () => {
    expect(fmtEUR(undefined)).toBe('0,00');
    expect(fmtEUR('')).toBe('0,00');
  });
  it('rundet korrekt', () => {
    expect(fmtEUR(1.005)).toBe('1,01');
  });
});

describe('toNumber', () => {
  it('wandelt gültige numerische Strings um', () => {
    expect(toNumber('42')).toBe(42);
    expect(toNumber('3.14')).toBe(3.14);
  });
  it('gibt 0 für ungültige/leere Werte zurück', () => {
    expect(toNumber('')).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('abc')).toBe(0);
  });
});

describe('PAUSE_MINUTEN_SCHRITTE / pauseOptionsFor', () => {
  it('bietet 0 bis 180 Minuten in 15er-Schritten', () => {
    expect(PAUSE_MINUTEN_SCHRITTE).toEqual([
      '0', '15', '30', '45', '60', '75', '90', '105', '120', '135', '150', '165', '180',
    ]);
  });

  it('gibt die Standard-Schritte zurück, wenn der aktuelle Wert leer ist', () => {
    expect(pauseOptionsFor('')).toBe(PAUSE_MINUTEN_SCHRITTE);
  });

  it('gibt die Standard-Schritte zurück, wenn der aktuelle Wert bereits ein 15er-Vielfaches ist', () => {
    expect(pauseOptionsFor('30')).toBe(PAUSE_MINUTEN_SCHRITTE);
  });

  it('fügt einen ungewöhnlichen Altwert (z.B. 20 Minuten) an der richtigen Stelle ein', () => {
    const result = pauseOptionsFor('20');
    expect(result).toContain('20');
    expect(result.indexOf('20')).toBe(result.indexOf('15') + 1);
    expect(result.indexOf('20')).toBe(result.indexOf('30') - 1);
  });

  it('ignoriert einen nicht-numerischen Altwert (fällt auf Standard-Schritte zurück)', () => {
    expect(pauseOptionsFor('abc')).toBe(PAUSE_MINUTEN_SCHRITTE);
  });
});

describe('rgbToGray', () => {
  it('gibt für reines Weiß 255 zurück', () => {
    expect(rgbToGray(255, 255, 255)).toBe(255);
  });

  it('gibt für reines Schwarz 0 zurück', () => {
    expect(rgbToGray(0, 0, 0)).toBe(0);
  });

  it('gewichtet Grün am stärksten (ITU-R BT.601)', () => {
    // Gleich helles Rot/Grün/Blau ergeben unterschiedliche Graustufen, Grün wird am hellsten.
    const gray = rgbToGray(0, 200, 0);
    expect(rgbToGray(200, 0, 0)).toBeLessThan(gray);
    expect(rgbToGray(0, 0, 200)).toBeLessThan(gray);
  });

  it('rundet auf ganze Zahlen', () => {
    expect(Number.isInteger(rgbToGray(123, 45, 200))).toBe(true);
  });
});

describe('estimateBase64Bytes', () => {
  it('schätzt die Bytegröße einer data:-URL korrekt (3/4-Faktor)', () => {
    // 'AAAA' (4 Base64-Zeichen) kodiert exakt 3 Rohbytes
    expect(estimateBase64Bytes('data:image/jpeg;base64,AAAA')).toBe(3);
  });

  it('skaliert linear mit der Base64-Länge', () => {
    const short = estimateBase64Bytes('data:image/jpeg;base64,' + 'A'.repeat(100));
    const long = estimateBase64Bytes('data:image/jpeg;base64,' + 'A'.repeat(1000));
    expect(long).toBeCloseTo(short * 10, -1);
  });
});
