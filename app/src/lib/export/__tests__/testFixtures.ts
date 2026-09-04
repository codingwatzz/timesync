// Gemeinsamer Test-Fixture-Helfer für die lib/export/-Tests. War vorher in 4 Testdateien
// fast identisch dupliziert (mit leicht auseinanderlaufenden Defaults - zwei Kopien hatten
// `typManuell: true`, zwei `false`, ohne dass das für irgendeinen Test einen Unterschied
// machte) - hier einmal zentral, jeder Test überschreibt bei Bedarf gezielt per `overrides`.

import type { TagesEintrag } from '../../../core/types';

export function leererEintrag(overrides: Partial<TagesEintrag> = {}): TagesEintrag {
  return {
    typ: 'A', typManuell: false, ho: false,
    start: '', ende: '', pause: '', start2: '', ende2: '', pause2: '',
    beschreibung: '', km: '', transport: '', hotel: '', bewirtung: '', sonstiges: '',
    reiseland: 'Deutschland', reiseart: '', fr: false, mi: false, ab: false,
    receiptIds: [],
    ...overrides,
  };
}
