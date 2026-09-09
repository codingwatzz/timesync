import { useCallback, useEffect, useState } from 'react';
import { useStore } from './useStore';
import { dateKey } from '../core/holidays';
import { daysInMonth } from '../core/formatters';
import { loadEntry, loadReceipt, saveEntry as saveEntryToStore } from './entryStorage';
import { belegFehltFuer } from '../core/entry';
import type { BelegMeta, TagesEintrag } from '../core/types';
import type { KVStore } from '../store/types';

export interface MonthState {
  year: number;
  month: number; // 1-12
  entries: Record<string, TagesEintrag>;
  loading: boolean;
}

/**
 * Lädt für alle Tage MIT Belegen (receiptIds.length > 0) deren Beleg-Metadaten nach und
 * liefert pro Tag ein einfaches Ja/Nein, ob mindestens ein Kostenfeld ohne zugeordneten Beleg
 * dasteht (siehe core/entry.ts::belegFehltFuer). Die genaue Feld-Liste ("für Hotel, Transport")
 * wird bewusst NICHT nach außen gegeben - die Monatsübersicht zeigt nur ein generisches
 * "Beleg fehlt"-Flag an, die Feld-Details liefert weiterhin nur das DetailSheet (Nutzer-
 * Rückfrage 08.09.2026: ein Array wäre hier unnötige Komplexität gewesen).
 * Bewusst NUR für Tage mit tatsächlich vorhandenen Belegen - Tage ohne jeden Beleg lassen sich
 * direkt aus dem Eintrag selbst ableiten (Kosten > 0 und receiptIds leer => "fehlt" ist trivial),
 * ohne zusätzliche Appwrite-Abfrage. Das hält die Zahl der Zusatz-Abfragen pro Monatsansicht klein
 * (typischerweise nur Reise-/Spesentage, nicht alle ~30 Tage) - siehe Abstimmung 08.09.2026.
 * Einzelne fehlgeschlagene Beleg-Abfragen werden übersprungen (nicht fatal, siehe
 * BelegMeta.feld-Kommentar "rein informativ") statt die ganze Monatsansicht zu blockieren.
 */
async function ladeBelegWarnungen(
  store: KVStore,
  entries: Record<string, TagesEintrag>,
): Promise<Record<string, boolean>> {
  const relevanteEintraege = Object.entries(entries).filter(([, e]) => e.receiptIds.length > 0);
  const alleIds = Array.from(new Set(relevanteEintraege.flatMap(([, e]) => e.receiptIds)));
  const belegeProId = new Map<string, BelegMeta>();
  await Promise.all(alleIds.map(async (id) => {
    try {
      const beleg = await loadReceipt(store, id);
      if (beleg) belegeProId.set(id, beleg);
    } catch {
      // Bewusst ignoriert - siehe Funktionskommentar oben.
    }
  }));
  const warnungen: Record<string, boolean> = {};
  for (const [key, e] of relevanteEintraege) {
    const receipts = e.receiptIds.map((id) => belegeProId.get(id)).filter((r): r is BelegMeta => r !== undefined);
    const fehlt = belegFehltFuer(e, receipts).length > 0;
    if (fehlt) warnungen[key] = true;
  }
  return warnungen;
}
export function useMonthEntries() {
  const { store } = useStore();
  const today = new Date();
  // year und month als EIN zusammengehöriger State statt zwei separater useState-Aufrufe:
  // vermeidet die Notwendigkeit, sie synchron zu halten (Ursache eines Lint-Hinweises zuvor).
  const [{ year, month }, setYearMonth] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });
  const [entries, setEntries] = useState<Record<string, TagesEintrag>>({});
  const [belegWarnungen, setBelegWarnungen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  // NEU (Engineering-Review 07.09.2026, Punkt 2): store.get() wirft jetzt bei echten
  // Fehlern (statt sie lautlos als "kein Eintrag" zu behandeln) - reload() muss das also
  // abfangen und sichtbar machen, sonst bliebe die App bei einem Netzwerkfehler einfach
  // dauerhaft im Ladezustand hängen, ohne dass der Nutzer je erfährt, warum.
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setLoadError(null);
    const n = daysInMonth(year, month);
    const keys = Array.from({ length: n }, (_, i) => dateKey(year, month, i + 1));
    try {
      const results = await Promise.all(keys.map((k) => loadEntry(store, k)));
      const next: Record<string, TagesEintrag> = {};
      keys.forEach((k, i) => {
        const e = results[i];
        if (e) next[k] = e;
      });
      setEntries(next);
      // Beleg-Warnungen NACH den Einträgen laden, nicht blockierend für die Haupt-Ansicht -
      // ein langsames/fehlschlagendes Nachladen der Beleg-Zuordnung soll die Monatsansicht
      // selbst nicht verzögern oder als Fehler anzeigen (siehe Funktionskommentar oben).
      ladeBelegWarnungen(store, next)
        .then(setBelegWarnungen)
        .catch(() => setBelegWarnungen({}));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [store, year, month]);

  // Lädt die Monatsdaten neu, sobald sich Jahr/Monat oder der Store ändern. Bewusst als
  // Effekt belassen (nicht zu "abgeleitetem State" umgebaut): es handelt sich um einen
  // echten asynchronen Netzwerk-Seiteneffekt (Store-Zugriff), kein reiner Render-Wert.
  useEffect(() => {
    reload();
  }, [reload]);

  const changeMonth = useCallback((delta: number) => {
    setYearMonth((prev) => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m > 12) { m = 1; y += 1; }
      if (m < 1) { m = 12; y -= 1; }
      return { year: y, month: m };
    });
  }, []);

  // Wirft absichtlich weiter, statt den Fehler hier zu schlucken - der Aufrufer (App.tsx)
  // entscheidet, wie ein fehlgeschlagenes Speichern dem Nutzer angezeigt wird (Toast). Der
  // lokale `entries`-State wird bei einem Fehler NICHT optimistisch aktualisiert (Zeile
  // darunter läuft nur, wenn saveEntryToStore() nicht geworfen hat).
  const saveEntry = useCallback(async (key: string, data: TagesEintrag) => {
    if (!store) return;
    await saveEntryToStore(store, key, data);
    setEntries((prev) => ({ ...prev, [key]: data }));
  }, [store]);

  return { year, month, entries, belegWarnungen, loading, loadError, changeMonth, reload, saveEntry };
}
