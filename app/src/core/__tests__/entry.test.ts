import { describe, it, expect } from 'vitest';
import { emptyEntry, tagesKosten, istVorOrtTag, arbeitszeitMinuten } from '../entry';

describe('emptyEntry', () => {
  it('setzt Homeoffice standardmäßig auf true', () => {
    expect(emptyEntry(2026, 8, 17).ho).toBe(true);
  });

  it('setzt Typ anhand von Wochentag/Feiertag', () => {
    expect(emptyEntry(2026, 8, 15).typ).toBe('W'); // Samstag
    expect(emptyEntry(2026, 8, 17).typ).toBe('A'); // Montag
    expect(emptyEntry(2026, 12, 25).typ).toBe('F'); // Weihnachten
  });

  it('zweite Schicht ist standardmäßig leer', () => {
    const e = emptyEntry(2026, 8, 17);
    expect(e.start2).toBe('');
    expect(e.ende2).toBe('');
    expect(e.pause2).toBe('');
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

describe('arbeitszeitMinuten', () => {
  const basis = emptyEntry(2026, 8, 17);

  it('berechnet Start-Ende minus Pause für die erste Schicht', () => {
    // 08:00-16:30 = 8h30min = 510min, minus 30min Pause = 480min
    expect(arbeitszeitMinuten({ ...basis, start: '08:00', ende: '16:30', pause: '30' })).toBe(480);
  });

  it('gibt 0 zurück, wenn Start oder Ende fehlt', () => {
    expect(arbeitszeitMinuten({ ...basis, start: '', ende: '16:00', pause: '0' })).toBe(0);
    expect(arbeitszeitMinuten({ ...basis, start: '08:00', ende: '', pause: '0' })).toBe(0);
  });

  it('zählt die zweite Schicht mit, falls befüllt', () => {
    const e = {
      ...basis, start: '08:00', ende: '12:00', pause: '0',
      start2: '17:00', ende2: '19:00', pause2: '0',
    };
    // 1. Schicht 4h (240min) + 2. Schicht 2h (120min) = 360min
    expect(arbeitszeitMinuten(e)).toBe(360);
  });

  it('ignoriert die zweite Schicht, wenn sie leer ist', () => {
    const e = { ...basis, start: '08:00', ende: '16:00', pause: '30' };
    expect(arbeitszeitMinuten(e)).toBe(450); // 8h = 480min, -30 Pause = 450
  });

  it('klemmt auf 0, wenn Ende vor Start liegt (unplausible Eingabe)', () => {
    expect(arbeitszeitMinuten({ ...basis, start: '16:00', ende: '08:00', pause: '0' })).toBe(0);
  });

  it('behandelt eine leere Pause wie 0 Minuten Pause', () => {
    expect(arbeitszeitMinuten({ ...basis, start: '08:00', ende: '16:00', pause: '' })).toBe(480);
  });
});
