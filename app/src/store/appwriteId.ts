// Appwrite-IDs: nur a-z, A-Z, 0-9, "_" erlaubt (keine ":", ".", "-"), max. 36 Zeichen,
// dürfen nicht mit "_" beginnen. Das hat uns beim ersten Anlauf einen echten Bug beschert
// (Datums-Keys wie "entry:2026-08-15" enthalten Doppelpunkt UND Bindestriche) - jetzt als
// eigene, unit-getestete Funktion statt inline im Storage-Code.

export function toAppwriteId(key: string): string {
  let id = key.replace(/[^a-zA-Z0-9_]/g, '_'); // alles Ungültige (":", "-", ".") -> "_"
  id = id.replace(/^_+/, ''); // führende "_" entfernen (nicht erlaubt)
  if (!id) id = 'id' + Date.now();
  if (id.length > 36) id = id.slice(0, 36);
  return id;
}

/**
 * Appwrite meldet "nicht gefunden" (z.B. Tag ohne Eintrag) als Fehler mit Code 404 -
 * das ist normales, erwartetes Verhalten und kein echter Fehler.
 */
export function isNotFoundError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { code?: number; message?: string };
  return err.code === 404 || /could not be found/i.test(err.message ?? '');
}
