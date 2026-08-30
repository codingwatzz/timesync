import { describe, it, expect } from 'vitest';
import { emptyEntry, tagesKosten, istVorOrtTag } from '../entry';

describe('emptyEntry', () => {
  it('setzt Homeoffice standardmäßig auf true', () => {
    expect(emptyEntry(2026, 8, 17).ho).toBe(true);
  });

  it('setzt Typ anhand von Wochentag/Feiertag', () => {
    expect(emptyEntry(2026, 8, 15).typ).toBe('W'); // Samstag
    expect(emptyEntry(2026, 8, 17).typ).toBe('A'); // Montag
    expect(emptyEntry(2026, 12, 25).typ).toBe('F'); // Weihnachten
  });
});

describe('tagesKosten', () => {
  it('summiert alle Kostenfelder', () => {
    expect(tagesKosten({ transport: '10', hotel: '90', bewirtung: '5.5', sonstiges: '2' })).toBe(107.5);
  });
  it('behandelt leere Felder als 0', () => {
    expect(tagesKosten({ transport: '', hotel: '', bewirtung: '', sonstiges: '' })).toBe(0);
  });
});

describe('istVorOrtTag', () => {
  const basis = emptyEntry(2026, 8, 17);

  it('ist false ohne Eintrag', () => {
    expect(istVorOrtTag(undefined)).toBe(false);
  });

  it('ist false bei Homeoffice', () => {
    expect(istVorOrtTag({ ...basis, ho: true, km: '50' })).toBe(false);
  });

  it('ist false bei Typ != A', () => {
    expect(istVorOrtTag({ ...basis, ho: false, typ: 'U', km: '50' })).toBe(false);
  });

  it('ist true bei Typ A, kein Homeoffice, und mind. einem Reisefeld gesetzt', () => {
    expect(istVorOrtTag({ ...basis, ho: false, typ: 'A', km: '50' })).toBe(true);
    expect(istVorOrtTag({ ...basis, ho: false, typ: 'A', reiseart: 'Anreisetag' })).toBe(true);
  });

  it('ist false bei Typ A, kein Homeoffice, aber KEIN Reisefeld gesetzt (reiner Bürotag)', () => {
    expect(istVorOrtTag({ ...basis, ho: false, typ: 'A' })).toBe(false);
  });
});
