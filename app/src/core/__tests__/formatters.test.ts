import { describe, it, expect } from 'vitest';
import { pad, daysInMonth, fmtEUR, toNumber } from '../formatters';

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
