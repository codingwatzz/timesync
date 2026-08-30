// Verpflegungsmehraufwand-Berechnung, 1:1 aus der echten Excel-Vorlage
// (Spesenabrechnung-Vorlage_neu_ab_01-2026.xltx) übernommen und mit echten
// Firmendaten (04-07/2026) verifiziert. Siehe Mapping-Referenz-Dokument im Projekt.
//
// WICHTIG: Die Schweiz-Sätze weichen bewusst von einem älteren "Listen"-Blatt in der
// Excel-Vorlage ab (70€/47€ dort vs. 64€/43€ hier) - hier gilt die tatsächliche Formel
// aus der Vorlage als Quelle der Wahrheit, nicht das (ungenutzte) Listen-Blatt.

import type { Reiseart, Reiseland } from './types';

const SAETZE: Record<Reiseland, { ganztags: number; teiltags: number }> = {
  Deutschland: { ganztags: 28, teiltags: 14 },
  Österreich: { ganztags: 50, teiltags: 33 },
  Schweiz: { ganztags: 64, teiltags: 43 },
};

export interface MahlzeitenFlags {
  fr: boolean; // Frühstück durch Firma bezahlt -> -20%
  mi: boolean; // Mittagessen durch Firma bezahlt -> -40%
  ab: boolean; // Abendessen durch Firma bezahlt -> -40%
}

/**
 * Berechnet den Verpflegungsmehraufwand in Euro für einen Tag.
 * Gibt 0 zurück, wenn keine Reiseart gesetzt ist (kein Anspruch).
 */
export function verpflegungsmehraufwand(
  reiseland: Reiseland,
  reiseart: Reiseart,
  mahlzeiten: MahlzeitenFlags,
): number {
  if (!reiseart) return 0;
  const saetze = SAETZE[reiseland] ?? SAETZE.Deutschland;
  const basis = reiseart === 'Abwesenheitstag (24h)' ? saetze.ganztags : saetze.teiltags;

  let kuerzungProzent = 0;
  if (mahlzeiten.fr) kuerzungProzent += 20;
  if (mahlzeiten.mi) kuerzungProzent += 40;
  if (mahlzeiten.ab) kuerzungProzent += 40;
  kuerzungProzent = Math.min(kuerzungProzent, 100);

  const betrag = basis * (1 - kuerzungProzent / 100);
  const cents = Math.round(betrag * 100 + 1e-9);
  return Math.max(0, cents / 100);
}
