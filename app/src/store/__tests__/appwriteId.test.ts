import { describe, it, expect } from 'vitest';
import { toAppwriteId, isNotFoundError } from '../appwriteId';

describe('toAppwriteId', () => {
  it('ersetzt Doppelpunkte und Bindestriche durch Unterstriche (der ursprüngliche Bug)', () => {
    expect(toAppwriteId('entry:2026-08-15')).toBe('entry_2026_08_15');
  });

  it('entfernt führende Unterstriche (nicht erlaubt in Appwrite)', () => {
    expect(toAppwriteId('__connection_test__')).toBe('connection_test__');
  });

  it('lässt bereits gültige IDs unverändert', () => {
    expect(toAppwriteId('receipt_r12345abc')).toBe('receipt_r12345abc');
  });

  it('kürzt auf maximal 36 Zeichen', () => {
    const langerKey = 'receipt:' + 'x'.repeat(50);
    expect(toAppwriteId(langerKey).length).toBeLessThanOrEqual(36);
  });

  it('gibt nie einen leeren String zurück', () => {
    expect(toAppwriteId('---')).not.toBe('');
    expect(toAppwriteId('').length).toBeGreaterThan(0);
  });
});

describe('isNotFoundError', () => {
  it('erkennt Appwrite-404-Fehler anhand des Codes', () => {
    expect(isNotFoundError({ code: 404, message: 'egal' })).toBe(true);
  });

  it('erkennt Appwrite-404-Fehler anhand der Nachricht', () => {
    expect(isNotFoundError({ message: "Row with the requested ID could not be found." })).toBe(true);
  });

  it('erkennt echte Fehler nicht fälschlich als "nicht gefunden"', () => {
    expect(isNotFoundError({ code: 401, message: 'Unauthorized' })).toBe(false);
  });

  it('ist robust gegenüber ungültigen Eingaben', () => {
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
    expect(isNotFoundError('ein string')).toBe(false);
  });
});
