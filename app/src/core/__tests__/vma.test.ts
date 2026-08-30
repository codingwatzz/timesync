import { describe, it, expect } from 'vitest';
import { verpflegungsmehraufwand } from '../vma';

describe('verpflegungsmehraufwand', () => {
  it('gibt 0 zurück ohne Reiseart', () => {
    expect(verpflegungsmehraufwand('Deutschland', '', { fr: false, mi: false, ab: false })).toBe(0);
  });

  it('Deutschland, Abwesenheitstag >8h, keine Mahlzeiten (echter Fall: 09.04.2026 war leer, hier Referenz 14€)', () => {
    expect(
      verpflegungsmehraufwand('Deutschland', 'Abwesenheitstag (>8h)', { fr: false, mi: false, ab: false }),
    ).toBe(14);
  });

  it('Deutschland, Abwesenheitstag 24h, keine Mahlzeiten (echter Fall: 08.04.2026 = 28€)', () => {
    expect(
      verpflegungsmehraufwand('Deutschland', 'Abwesenheitstag (24h)', { fr: false, mi: false, ab: false }),
    ).toBe(28);
  });

  it('Österreich, teiltags = 33€', () => {
    expect(
      verpflegungsmehraufwand('Österreich', 'Abwesenheitstag (>8h)', { fr: false, mi: false, ab: false }),
    ).toBe(33);
  });

  it('Schweiz nutzt die Formel-Sätze (64/43), nicht das abweichende Listen-Blatt (70/47)', () => {
    expect(
      verpflegungsmehraufwand('Schweiz', 'Abwesenheitstag (24h)', { fr: false, mi: false, ab: false }),
    ).toBe(64);
    expect(
      verpflegungsmehraufwand('Schweiz', 'Abwesenheitstag (>8h)', { fr: false, mi: false, ab: false }),
    ).toBe(43);
  });

  it('kürzt bei bezahltem Frühstück um 20%', () => {
    expect(
      verpflegungsmehraufwand('Deutschland', 'Abwesenheitstag (24h)', { fr: true, mi: false, ab: false }),
    ).toBe(22.4);
  });

  it('kürzt bei bezahltem Mittag- und Abendessen um je 40%', () => {
    expect(
      verpflegungsmehraufwand('Deutschland', 'Abwesenheitstag (24h)', { fr: false, mi: true, ab: true }),
    ).toBe(5.6);
  });

  it('wird nie negativ, auch bei theoretischer Überkürzung', () => {
    const betrag = verpflegungsmehraufwand('Deutschland', 'Abwesenheitstag (24h)', {
      fr: true,
      mi: true,
      ab: true,
    });
    expect(betrag).toBeGreaterThanOrEqual(0);
  });

  it('Anreisetag und Abreisetag nutzen den teiltags-Satz', () => {
    expect(
      verpflegungsmehraufwand('Deutschland', 'Anreisetag', { fr: false, mi: false, ab: false }),
    ).toBe(14);
    expect(
      verpflegungsmehraufwand('Deutschland', 'Abreisetag', { fr: false, mi: false, ab: false }),
    ).toBe(14);
  });
});
