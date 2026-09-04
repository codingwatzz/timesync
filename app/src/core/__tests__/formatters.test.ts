import { describe, it, expect } from 'vitest';
import { pad, daysInMonth, fmtEUR, toNumber, pauseOptionsFor, PAUSE_MINUTEN_SCHRITTE, rgbToGray, kontraststreckung, estimateBase64Bytes, fmtHHMM, istVergangenheit } from '../formatters';

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

describe('kontraststreckung', () => {
  it('macht einen Wert am Weißpunkt zu reinem Weiß (255)', () => {
    expect(kontraststreckung(190, 190)).toBe(255);
  });

  it('lässt Werte über dem Weißpunkt nicht über 255 hinausgehen (kein Überlauf)', () => {
    expect(kontraststreckung(255, 190)).toBe(255);
  });

  it('gibt für Schwarz weiterhin Schwarz zurück (0 bleibt 0)', () => {
    expect(kontraststreckung(0, 190)).toBe(0);
  });

  it('hellt einen typischen grauen Tischhintergrund (176) fast zu Weiß auf', () => {
    // Realer Messwert vom 04.09.2026 (echter Beleg-Foto-Hintergrund) - Nutzerbeschwerde
    // "zu viel grau beim Drucken". Mit Weißpunkt 190 wird das fast rein weiß.
    expect(kontraststreckung(176, 190)).toBeGreaterThan(235);
  });

  it('verändert dunkle Ziffern-Pixel nur moderat (keine harte 0/255-Schwelle)', () => {
    // Im Gegensatz zum verworfenen harten Schwellenwert (03.09.2026, "0" wurde zu "3")
    // bleibt hier eine kontinuierliche Abstufung erhalten statt eines harten Sprungs.
    const dunkel = kontraststreckung(20, 190);
    const mittel = kontraststreckung(100, 190);
    expect(dunkel).toBeLessThan(mittel);
    expect(mittel).toBeLessThan(255);
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

describe('fmtHHMM', () => {
  it('formatiert Minuten als hh:mm', () => {
    expect(fmtHHMM(90)).toBe('01:30');
    expect(fmtHHMM(480)).toBe('08:00');
    expect(fmtHHMM(0)).toBe('00:00');
  });

  it('füllt Stunden und Minuten mit führender Null', () => {
    expect(fmtHHMM(65)).toBe('01:05');
  });

  it('funktioniert auch über 24 Stunden hinaus (z.B. Summe über zwei Schichten)', () => {
    expect(fmtHHMM(1500)).toBe('25:00');
  });
});

describe('istVergangenheit', () => {
  const referenz = new Date(2026, 8, 4); // 04.09.2026 (Monat 0-indiziert: 8 = September)

  it('ist true für einen Tag vor dem Referenzdatum', () => {
    expect(istVergangenheit(2026, 9, 3, referenz)).toBe(true);
    expect(istVergangenheit(2026, 8, 15, referenz)).toBe(true); // anderer Monat
  });

  it('ist false für das Referenzdatum selbst (heute ist noch nicht "vergessen")', () => {
    expect(istVergangenheit(2026, 9, 4, referenz)).toBe(false);
  });

  it('ist false für einen Tag nach dem Referenzdatum', () => {
    expect(istVergangenheit(2026, 9, 5, referenz)).toBe(false);
    expect(istVergangenheit(2026, 10, 1, referenz)).toBe(false);
  });

  it('ignoriert die Uhrzeit des Referenzdatums (nur der Kalendertag zählt)', () => {
    const spaetAbends = new Date(2026, 8, 4, 23, 59);
    expect(istVergangenheit(2026, 9, 4, spaetAbends)).toBe(false);
    expect(istVergangenheit(2026, 9, 3, spaetAbends)).toBe(true);
  });
});
